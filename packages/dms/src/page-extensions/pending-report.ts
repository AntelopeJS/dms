import { Logging } from "@antelopejs/interface-core/logging";
import { Events } from "@antelopejs/interface-core/modules";
import {
  GetPendingPageExtensions,
  GetRegisteredPageIds,
} from "@antelopejs/interface-dms/page";

// A page extension names its target by id, so nothing can be checked when it is
// declared: the page may simply belong to a module that has yet to start. The
// report waits for the module starts to stop coming in, which is as close to
// "the project is up" as a module can get, and runs again after a hot reload.
const SETTLE_DELAY_MS = 2000;

let reportTimer: NodeJS.Timeout | undefined;

function reportPendingExtensions(): void {
  reportTimer = undefined;
  const pending = GetPendingPageExtensions();
  if (pending.length === 0) return;

  // The registered ids are counted, not listed: a deployment has hundreds of
  // them, and the id the author needs is the page's permission id.
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
