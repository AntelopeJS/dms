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
  Hook,
  RegisterHook,
  SettleHook,
  UnsettleHook,
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
  getConfig,
  getFrontendConfig,
  getHtmlRenderConfig,
  isDocsPreviewEnabled,
} from "./config";
import {
  CLEANUP_USER_INVITES_CRON_NAME,
  registerDmsCrons,
  runCleanupUserInvites,
} from "./crons";
import {
  runSweepStaleExports,
  SWEEP_STALE_EXPORTS_CRON_NAME,
} from "./crons/sweep-stale-exports";
import {
  startModuleUpdateWatcher,
  stopModuleUpdateWatcher,
} from "./dev/module-update-notifications";
import { registerInviteExtensionCleanup } from "./hooks/invite-extensions";
import { registerTenantDeletedCleanup } from "./hooks/tenant-deleted";
import { registerTenantInstanceProvisioning } from "./hooks/tenant-instances";
import { registerWorkspaceNotifications } from "./hooks/workspace-notifications";
import {
  cancelScheduledBroadcast,
  closeDevReloadStreams,
} from "./implementations/dms/dev-reload";
import { publishDevBootstrapCredential } from "./implementations/dms/dev-handshake";
import { initFrontendBootstrapSecret } from "./implementations/dms/frontend-bootstrap";
import {
  cancelMissingCategoryCheck,
  cancelPendingMenuNotifications,
} from "./implementations/dms/page";
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
import { registerDocsPreviewPage } from "./pages/public/preview";
import { deriveOAuthRelaySecret } from "./routes/auth/oauth/relay";
import { frontendModule } from "./frontend-module";
import {
  assertProductionSecrets,
  resolveClientBaseUrl,
} from "./startup-config";
import { allowClientOrigin } from "./client-origin-cors";
import {
  ensureDefaultTenantExists,
  registerExistingTenantInstances,
} from "./utils";

export * from "./config";

let cronTasks: ScheduledTask[] = [];
let staleExportsSweep: Promise<void> = Promise.resolve();

let globalRealtimeConfig: RealtimeConfig | undefined;

export async function construct(config: Config): Promise<void> {
  const { dev } = await GetRuntimeInfo();
  // Checked here rather than when the project configuration is evaluated: a
  // production build evaluates it without the deployment's secrets.
  applyConfig({
    ...config,
    clientBaseUrl: resolveClientBaseUrl(config.clientBaseUrl, dev),
  });
  if (!dev) assertProductionSecrets();
  globalRealtimeConfig = config.realtime;

  await setupFrontendBootstrap(dev);

  RegisterHook(Hook.DATABASE_INITIALIZED, async () => {
    await ensureDefaultTenantExists();
    await registerExistingTenantInstances();
    return undefined;
  });

  registerTenantInstanceProvisioning();
  registerTenantDeletedCleanup();
  registerInviteExtensionCleanup();
  registerWorkspaceNotifications();

  await implementInterfaces();
  await registerDmsFrontend(dev);

  if (isDocsPreviewEnabled(dev)) {
    registerDocsPreviewPage();
  }
}

async function setupFrontendBootstrap(dev: boolean): Promise<void> {
  initFrontendBootstrapSecret(dev);

  if (dev) {
    await publishDevBootstrapCredential();
    return;
  }

  if (!getFrontendConfig().bootstrapSecret?.trim()) {
    Logging.Warn(
      "[DMS] frontend.bootstrapSecret is not configured, so GET /dms/frontend and POST /dms/frontend/ready " +
        "are open to anyone who can reach this backend. Configure frontend.bootstrapSecret and set the same " +
        "value as DMS_BOOTSTRAP_SECRET on the frontend server.",
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
    await import("@antelopejs/interface-dms/layout-banners"),
    await import("./implementations/dms/layout-banners"),
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
    await import("@antelopejs/interface-dms/utils/saas-mode"),
    await import("./implementations/dms/saas-mode"),
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
    await import("@antelopejs/interface-dms/api-base-url"),
    await import("./implementations/dms/api-base-url"),
  );
  void ImplementInterface(
    await import("@antelopejs/interface-dms/client-ip"),
    await import("./implementations/dms/client-ip"),
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

/**
 * The registration `frontendModule` computes from the configuration, plus the
 * private options, which never leave the backend and the frontend server.
 */
async function registerDmsFrontend(dev: boolean): Promise<void> {
  // The merged configuration: its clientBaseUrl is the one construct() checked.
  const registration = frontendModule(getConfig(), { dev });
  if (!registration) return;
  await AddFrontendModule({
    ...registration,
    privateOptions: {
      htmlRender: {
        serviceSecret: getHtmlRenderConfig().serviceSecret ?? null,
      },
      oauth: {
        relaySecret: deriveOAuthRelaySecret(),
      },
    },
  });
}

/**
 * Drops the debounced notifications the registries schedule. Taking a page down
 * arms one, so the module's teardown has to run first or it re-arms behind us.
 */
function cancelDeferredNotifications(): void {
  cancelPendingMenuNotifications();
  cancelMissingCategoryCheck();
  cancelScheduledBroadcast();
  cancelPendingExtensionReport();
}

export function destroy(): void {
  cancelDeferredNotifications();
  closeDevReloadStreams();
}

export async function start(): Promise<void> {
  await allowClientOrigin();
  await configureRealtime(globalRealtimeConfig);
  await RegisterSchema(CORE_SCHEMA_NAME);
  await RegisterSchema(TENANT_SCHEMA_NAME);
  await SettleHook(Hook.DATABASE_INITIALIZED);
  // `start()` means ready to serve: the sweep scans every tenant and serves
  // no request, so it runs behind the open gate. `stop()` waits for it.
  staleExportsSweep = runSweepStaleExports().catch((error: unknown) => {
    Logging.Error(`Cron '${SWEEP_STALE_EXPORTS_CRON_NAME}' failed:`, error);
  });
  cronTasks = registerDmsCrons();
  // Invitations that expired while no process ran are settled now, not at
  // the next 3 a.m. run: their inviters hear about it the same day.
  void runCleanupUserInvites().catch((error: unknown) => {
    Logging.Error(`Cron '${CLEANUP_USER_INVITES_CRON_NAME}' failed:`, error);
  });
  await registerAutomationNodes();
  await startModuleUpdateWatcher();
  startPendingExtensionReport();
}

export async function stop(): Promise<void> {
  await staleExportsSweep;
  UnsettleHook(Hook.DATABASE_INITIALIZED);
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
    closeDevReloadStreams();
  }
}
