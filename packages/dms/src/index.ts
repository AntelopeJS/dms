import { ImplementInterface } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { Events } from "@antelopejs/interface-core/modules";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { RegisterSchema } from "@antelopejs/interface-database-decorators";
import {
  CORE_SCHEMA_NAME,
  DEFAULT_TENANT_ID,
  TENANT_SCHEMA_NAME,
} from "@antelopejs/interface-dms/constants";
import { announceSetupToken } from "./db";

// oxlint-disable-next-line import/no-duplicates -- Initialize realtime before page and route side effects; the later named import supplies lifecycle functions without moving this initialization order.
import "./realtime";
import "./implementations/dms-auth/email-templates";
import "./pages";
import "./routes";
import {
  Hook,
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
  runSweepStaleExports,
  SWEEP_STALE_EXPORTS_CRON_NAME,
} from "./crons";
import { startModuleUpdateWatcher, stopModuleUpdateWatcher } from "./dev";
import {
  registerInviteExtensionCleanup,
  registerTenantDeletedCleanup,
  registerWorkspaceNotifications,
} from "./hooks";
import {
  cancelScheduledBroadcast,
  closeDevReloadStreams,
  initFrontendBootstrapSecret,
} from "./store/frontend";
import { publishDevBootstrapCredential } from "./implementations/dms/services";
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
} from "./page-extensions";
import { registerDocsPreviewPage } from "./pages/public/preview";
import { deriveOAuthRelaySecret } from "./routes/oauth";
import { frontendModule } from "./frontend-module";
import {
  assertProductionSecrets,
  resolveClientBaseUrl,
} from "./config/startup-config";
import { allowClientOrigin } from "./config/client-origin-cors";
import {
  ensureDefaultTenantExists,
  provisionDefaultTenant,
  registerExistingTenantInstances,
} from "./utils";

export * from "./config";

let cronTasks: ScheduledTask[] = [];
let staleExportsSweep: Promise<void> = Promise.resolve();
let defaultTenantProvisioning: Promise<void> | undefined;
let provisioningWait = new AbortController();

/**
 * How long `stop()` waits for a provisioning run after the abort. Long enough for
 * a handler that only writes a few rows, and short enough to leave most of the
 * 10 s core gives the modules to stop.
 */
const PROVISIONING_STOP_GRACE_MS = 2000;

let globalRealtimeConfig: RealtimeConfig | undefined;

export async function construct(config: Config): Promise<void> {
  const { dev } = await GetRuntimeInfo();

  applyConfig({
    ...config,
    clientBaseUrl: resolveClientBaseUrl(config.clientBaseUrl, dev),
  });
  if (!dev) assertProductionSecrets();
  globalRealtimeConfig = config.realtime;

  await setupFrontendBootstrap(dev);

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
 * The registration `frontendModule` computes from the configuration, its
 * private options filled with the backend's secrets.
 */
async function registerDmsFrontend(dev: boolean): Promise<void> {
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

/**
 * Waits for a provisioning run for at most the grace period, then lets it go, so
 * a hook that never resolves cannot hold the shutdown. The tenant stays pending
 * for a later start.
 */
async function settleProvisioning(): Promise<void> {
  const provisioning = defaultTenantProvisioning;
  if (!provisioning) return;
  let timer: NodeJS.Timeout | undefined;
  const settled = await Promise.race([
    provisioning.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(resolve, PROVISIONING_STOP_GRACE_MS, false);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!settled) {
    Logging.Warn(
      `[DMS] Abandoned the provisioning of tenant '${DEFAULT_TENANT_ID}', still running ${PROVISIONING_STOP_GRACE_MS} ms after stop. The tenant stays pending, and a later start provisions it.`,
    );
  }
}

function onModulesStarted(): void {
  if (defaultTenantProvisioning) return;
  provisioningWait = new AbortController();
  defaultTenantProvisioning = provisionDefaultTenant(
    provisioningWait.signal,
  ).finally(() => {
    defaultTenantProvisioning = undefined;
  });
}

export async function start(): Promise<void> {
  await allowClientOrigin();
  await configureRealtime(globalRealtimeConfig);
  await RegisterSchema(CORE_SCHEMA_NAME);
  await RegisterSchema(TENANT_SCHEMA_NAME);
  await ensureDefaultTenantExists();
  await announceSetupToken();
  await registerExistingTenantInstances();
  await SettleHook(Hook.DATABASE_INITIALIZED);

  staleExportsSweep = runSweepStaleExports().catch((error: unknown) => {
    Logging.Error(`Cron '${SWEEP_STALE_EXPORTS_CRON_NAME}' failed:`, error);
  });
  cronTasks = registerDmsCrons();

  void runCleanupUserInvites().catch((error: unknown) => {
    Logging.Error(`Cron '${CLEANUP_USER_INVITES_CRON_NAME}' failed:`, error);
  });
  await registerAutomationNodes();
  await startModuleUpdateWatcher();
  startPendingExtensionReport();
  Events.ModulesStarted.register(onModulesStarted);
}

export async function stop(): Promise<void> {
  Events.ModulesStarted.unregister(onModulesStarted);
  provisioningWait.abort();
  await settleProvisioning();
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
