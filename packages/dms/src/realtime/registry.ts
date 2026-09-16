const USER_NOTIFICATION_TOPIC_PREFIX = "notifications:user:";
const MENU_TOPIC_PREFIX = "menu:tenant:";

export const MENU_CHANGED_EVENT_TYPE = "menu-changed";

/** Every session of one tenant, for menu invalidations scoped to it. */
export function buildMenuTopic(tenantId: string): string {
  return `${MENU_TOPIC_PREFIX}${tenantId}`;
}

/**
 * Every connected session, for a menu invalidation that names no tenant. Its
 * name sits outside the per-tenant prefix, so no tenant id can collide with it.
 */
export const MENU_BROADCAST_TOPIC = "menu:all";

export function buildUserNotificationTopic(userId: string): string {
  return `${USER_NOTIFICATION_TOPIC_PREFIX}${userId}`;
}

const pageTopics = new Map<string, Set<string>>();

export function registerPageTopic(pageId: string, topic: string): void {
  let topics = pageTopics.get(pageId);
  if (!topics) {
    topics = new Set();
    pageTopics.set(pageId, topics);
  }
  topics.add(topic);
}

// A page that goes away takes its topics with it: they are the allowlist the
// SSE routes check subscriptions against, so a stale one keeps offering a
// surface that no longer serves.
export function clearPageTopics(pageId: string): void {
  pageTopics.delete(pageId);
}

export function getPageTopics(pageId: string): ReadonlySet<string> {
  return pageTopics.get(pageId) ?? new Set();
}
