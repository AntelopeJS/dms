import { Logging } from "@antelopejs/interface-core/logging";
import { Events } from "@antelopejs/interface-core/modules";
import { GetPendingPageExtensions } from "@antelopejs/interface-dms/page/internal/registry";
import { GetRegisteredPageIds } from "@antelopejs/interface-dms/page";

const SETTLE_DELAY_MS = 2000;

let reportTimer: NodeJS.Timeout | undefined;

function reportPendingExtensions(): void {
  reportTimer = undefined;
  const pending = GetPendingPageExtensions();
  if (pending.length === 0) return;

  const registered = GetRegisteredPageIds().length;
  for (const { extensionName, targetFullId } of pending) {
    Logging.Warn(
      `[dms] page extension "${extensionName}" is still waiting for page "${targetFullId}", which no started module registers. A target page id is the page's permission id; GetRegisteredPageIds() lists the ${registered} pages registered right now.`,
    );
  }
}

function scheduleReport(): void {
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(reportPendingExtensions, SETTLE_DELAY_MS);
  reportTimer.unref();
}

export function startPendingExtensionReport(): void {
  Events.ModuleStarted.register(scheduleReport);
  scheduleReport();
}

export function stopPendingExtensionReport(): void {
  Events.ModuleStarted.unregister(scheduleReport);
  cancelPendingExtensionReport();
}

/** Drop the armed report: it reaches into the interface after the stop. */
export function cancelPendingExtensionReport(): void {
  if (!reportTimer) return;
  clearTimeout(reportTimer);
  reportTimer = undefined;
}
