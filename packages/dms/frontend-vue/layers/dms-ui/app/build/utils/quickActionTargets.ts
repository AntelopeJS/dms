import type { QuickActionIntent } from "../../types/quick-actions";

/** Runs a quick-action intent (open the creation form, press a button). */
export type QuickActionTargetRunner = (intent: QuickActionIntent) => void;

/** A table view mounted on the page, able to answer quick actions. */
export interface MountedQuickActionTarget {
  /** Path of the page that mounted it. */
  path: string;
  /** Its component id, which quick actions and header buttons name. */
  componentId: string;
  run: QuickActionTargetRunner;
}

// Browser-only: table views register once mounted, so a server render never
// adds to this module-wide set shared by every request.
const mountedTargets = new Set<MountedQuickActionTarget>();

/**
 * Called by a table view once mounted: something on its own page (a header
 * button) can then press its buttons in place, rather than through the URL.
 *
 * @returns The callback that unregisters it, to call on unmount
 */
export function registerQuickActionTarget(
  target: MountedQuickActionTarget,
): () => void {
  mountedTargets.add(target);
  return () => {
    mountedTargets.delete(target);
  };
}

/**
 * Runs `intent` on the table view `componentId` of the page at `path`, if it
 * is mounted. Pressing in place opens the form or modal on the click: the
 * URL route (`quickAction` query) is only for a table view on another page,
 * and costs two server visits.
 *
 * @returns Whether a mounted table view ran it
 */
export function runMountedQuickAction(
  path: string,
  componentId: string,
  intent: QuickActionIntent,
): boolean {
  for (const target of mountedTargets) {
    if (target.path === path && target.componentId === componentId) {
      target.run(intent);
      return true;
    }
  }
  return false;
}
