import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import {
  CORE_SCHEMA_NAME,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import "./db";
// Evaluated here on purpose, ahead of the named import below: the realtime
// module has to be initialised before anything that reaches into it.
// oxlint-disable-next-line import/no-duplicates
import "./realtime";
import "./pages";
import "./routes";
import {
  ExecuteHooks,
  Hook,
  RegisterHook,
} from "@antelopejs/interface-dms/hooks";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import type { ScheduledTask } from "node-cron";
import {
  registerAutomationNodes,
  unregisterAutomationNodes,
} from "./automation";
import {
  applyConfig,
  type Config,
  getAuthConfig,
  getConfig,
  getFrontendConfig,
  getHtmlRenderConfig,
} from "./config";
import { registerDmsCrons } from "./crons";
import { runSweepStaleExports } from "./crons/sweep-stale-exports";
import {
  startModuleUpdateWatcher,
  stopModuleUpdateWatcher,
} from "./dev/module-update-notifications";
import { registerInviteExtensionCleanup } from "./hooks/invite-extensions";
import { registerTenantDeletedCleanup } from "./hooks/tenant-deleted";
import { cancelScheduledBroadcast } from "./implementations/dms/dev-reload";
import { publishDevBootstrapCredential } from "./implementations/dms/dev-handshake";
import { initFrontendBootstrapSecret } from "./implementations/dms/frontend-bootstrap";
import { cancelPendingMenuNotifications } from "./implementations/dms/page";
import {
  configureRealtime,
  type RealtimeConfig,
  stopRealtime,
} from "./realtime";
import {
  cancelPendingExtensionReport,
  startPendingExtensionReport,
  stopPendingExtensionReport,
} from "./page-extensions/pending-report";
import { listEnabledOAuthProviders } from "./routes/auth/oauth/config";
import { deriveOAuthRelaySecret } from "./routes/auth/oauth/relay";
import { detectSaasMode, ensureDefaultTenantExists } from "./utils";
import { MILLISECONDS_PER_SECOND } from "@antelopejs/interface-dms/utils/time";

export * from "./config";

let cronTasks: ScheduledTask[] = [];

let globalRealtimeConfig: RealtimeConfig | undefined;

export async function construct(config: Config): Promise<void> {
  applyConfig(config);
  globalRealtimeConfig = config.realtime;

  await setupFrontendBootstrap();

  RegisterHook(Hook.DATABASE_INITIALIZED, async () => {
    await ensureDefaultTenantExists();
    return undefined;
  });

  registerTenantDeletedCleanup();
  registerInviteExtensionCleanup();

  await implementInterfaces();
  await registerDmsFrontend();
}

async function setupFrontendBootstrap(): Promise<void> {
  const { dev } = await GetRuntimeInfo();
  initFrontendBootstrapSecret(dev);

  if (dev) {
    await publishDevBootstrapCredential();
    return;
  }

  if (!getFrontendConfig().bootstrapSecret?.trim()) {
    Logging.Warn(
      "[DMS] frontend.bootstrapSecret is not configured, so GET /dms/frontend and GET /dms/frontend/modules " +
        "are open to anyone who can reach this backend — /dms/frontend/modules streams the full source " +
        "of every registered frontend module. Configure frontend.bootstrapSecret and set the same value " +
        "as DMS_BOOTSTRAP_SECRET where the frontend is built.",
    );
  }
}

async function implementInterfaces(): Promise<void> {
  void ImplementInterface(
    await import("@antelopejs/interface-dms/html-render"),
    await import("./implementations/dms-html-render"),
  );

  void ImplementInterface(
    await import("@antelopejs/interface-dms/page"),
    await import("./implementations/dms/page"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/permissions"),
    await import("./implementations/dms/permissions"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/quick-actions"),
    await import("./implementations/dms/quick-actions"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/invite-extensions"),
    await import("./implementations/dms/invite-extensions"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/permissions-resolver"),
    await import("./implementations/dms/permissions-resolver"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/tenant-access"),
    await import("./implementations/dms/tenant-access"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/attachments"),
    await import("./implementations/dms/attachments"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/realtime"),
    await import("./implementations/dms/realtime"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/uploads"),
    await import("./implementations/dms/uploads"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/guards"),
    await import("./implementations/dms/guards"),
  );

  void ImplementInterface(
    await import("@antelopejs/interface-dms/base/table-view"),
    await import("./implementations/dms-base/table-view"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/base/export-jobs"),
    await import("./implementations/dms-base/export-jobs"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/base/tenant-export-archive"),
    await import("./implementations/dms-base/tenant-export-archive"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/client-base-url"),
    await import("./implementations/dms/client-base-url"),
  );

  void ImplementInterface(
    await import("@antelopejs/interface-dms/auth"),
    await import("./implementations/dms-auth"),
  );

  void ImplementInterface(
    await import("@antelopejs/interface-dms/notifications"),
    await import("./implementations/dms-notifications"),
  );
}

async function registerDmsFrontend(): Promise<void> {
  const config = getConfig();
  const authConfig = getAuthConfig();
  const sharedOptions = {
    configKey: "dms",
    priority: 0,
    options: {
      baseURL: config.apiBaseUrl ?? "",
      clientBaseUrl: config.clientBaseUrl ?? "",
      mustValidateEmail: false,
      token: {
        maxAgeInSeconds:
          authConfig.accessTokenLifetime / MILLISECONDS_PER_SECOND,
      },
      homepage: config.homepage ?? "/",
      oauthProviders: listEnabledOAuthProviders().map(
        ({ id, label, icon }) => ({
          id,
          label,
          icon,
        }),
      ),
    },
    privateOptions: {
      htmlRender: {
        serviceSecret: getHtmlRenderConfig().serviceSecret ?? null,
      },
      oauth: {
        relaySecret: deriveOAuthRelaySecret(),
        trustProxy: authConfig.oauth?.trustProxy ?? false,
      },
    },
  };

  await AddFrontendModule({
    ...sharedOptions,
    name: "@antelopejs/dms-frontend-vue",
    sourcePath: path.join(__dirname, "../frontend-vue"),
    renderer: { name: "vue", version: "3" },
  });
}

/**
 * Drops the debounced notifications the registries schedule. Taking a page down
 * arms one, so the module's teardown has to run first or it re-arms behind us.
 */
function cancelDeferredNotifications(): void {
  cancelPendingMenuNotifications();
  cancelScheduledBroadcast();
  cancelPendingExtensionReport();
}

export function destroy(): void {
  cancelDeferredNotifications();
}

export async function start(): Promise<void> {
  await configureRealtime(globalRealtimeConfig);
  await detectSaasMode();
  await RegisterSchema(CORE_SCHEMA_NAME);
  await RegisterSchema(TENANT_SCHEMA_NAME);
  await ExecuteHooks(Hook.DATABASE_INITIALIZED);
  await runSweepStaleExports();
  cronTasks = registerDmsCrons();
  await registerAutomationNodes();
  await startModuleUpdateWatcher();
  startPendingExtensionReport();
}

export async function stop(): Promise<void> {
  stopPendingExtensionReport();
  await stopModuleUpdateWatcher();
  await unregisterAutomationNodes();
  try {
    const teardowns = await Promise.allSettled(
      cronTasks.map(async (task) => task.destroy()),
    );
    for (const teardown of teardowns) {
      if (teardown.status === "rejected") {
        Logging.Error("A cron task failed to stop", teardown.reason);
      }
    }
  } finally {
    cronTasks = [];
    await stopRealtime();
    cancelDeferredNotifications();
  }
}
