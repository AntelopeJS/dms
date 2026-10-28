import { scheduleBroadcast } from "../../../store/frontend";
import {
  MENU_BROADCAST_TOPIC,
  buildMenuTopic,
  buildMemberMenuTopic,
  getRealtimeBroker,
  MENU_CHANGED_EVENT_TYPE,
} from "../../../realtime";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

export let previewStructureVersion = 0;

/**
 * Invalidates structural previews and broadcasts visible navigation changes.
 * Dev resync re-probes routes; realtime also reaches production clients.
 * Hidden surfaces do not enter the tree and must not trigger this broadcast.
 */
export function notifyStructureChanged(): void {
  previewStructureVersion++;
  scheduleBroadcast();
  schedulePublishMenuChanged(MENU_BROADCAST_TOPIC);
}

/**
 * Implements the {@link NotifyMenuChanged} interface function: invalidates the
 * menu on both channels, the realtime stream that reaches connected clients in
 * production and the dev resync broadcast that additionally re-probes routes
 * after a hot reload.
 */
export function NotifyMenuChanged(tenantId?: string): void {
  scheduleBroadcast();
  schedulePublishMenuChanged(
    tenantId ? buildMenuTopic(tenantId) : MENU_BROADCAST_TOPIC,
  );
}

/**
 * What some members of a tenant may open changed (a role's permissions for
 * its holders, a member's roles or ownership, a removal): their own sessions
 * reload their menus, on each one's topic, and the rest of the workspace is
 * left alone. The menu's structure did not change, so unlike
 * {@link NotifyMenuChanged} the dev resync, which re-probes routes after a hot
 * reload, stays out of it.
 *
 * @param tenantId The tenant whose access changed
 * @param userIds The members whose access changed
 */
export function notifyMenuAccessChanged(
  tenantId: string,
  userIds: Iterable<string>,
): void {
  for (const userId of new Set(userIds)) {
    schedulePublishMenuChanged(buildMemberMenuTopic(tenantId, userId));
  }
}

export const MODULE_CONTEXT_GONE = "ERR_MODULE_CONTEXT_INVALIDATED";

export function isModuleContextGone(
  error: PromiseRejectedResult["reason"],
): boolean {
  return (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Promise rejections can be non-Error objects; preserve the framework code check without imposing an Error constructor.
    typeof error === "object" &&
    error !== null &&
    error.code === MODULE_CONTEXT_GONE
  );
}

export function ignoreModuleContextGone(error: Error["cause"]): void {
  if (!isModuleContextGone(error)) throw error;
}

export const MENU_NOTIFICATION_WINDOW_MS = 250;

export const lastMenuPublishAt = new Map<string, number>();

export const pendingMenuNotifications = new Map<string, NodeJS.Timeout>();

export function schedulePublishMenuChanged(target: string): void {
  const publish = (): void => {
    lastMenuPublishAt.set(target, Date.now());
    try {
      fireAndForget(
        publishMenuChanged(target).catch(ignoreModuleContextGone),
        "menu change notification",
      );
    } catch (error) {
      ignoreModuleContextGone(error);
    }
  };

  if (pendingMenuNotifications.has(target)) return;
  const sinceLast = Date.now() - (lastMenuPublishAt.get(target) ?? 0);
  if (sinceLast >= MENU_NOTIFICATION_WINDOW_MS) {
    publish();
    return;
  }
  const timer = setTimeout(() => {
    pendingMenuNotifications.delete(target);
    publish();
  }, MENU_NOTIFICATION_WINDOW_MS - sinceLast);
  timer.unref?.();
  pendingMenuNotifications.set(target, timer);
}

/**
 * A trailing publish left behind by the last change would fire against a torn
 * down module: the interface calls it makes are bound to the module context,
 * and reaching them once that context is gone throws out of a timer callback,
 * where nothing can catch it.
 */
export function cancelPendingMenuNotifications(): void {
  for (const timer of pendingMenuNotifications.values()) {
    clearTimeout(timer);
  }
  pendingMenuNotifications.clear();
}

export async function publishMenuChanged(topic: string): Promise<void> {
  await getRealtimeBroker().publish({
    topic,
    type: MENU_CHANGED_EVENT_TYPE,
    ts: Date.now(),
  });
}
