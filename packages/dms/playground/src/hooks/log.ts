import type { ActivityFeedItem } from "@antelopejs/interface-dms/base";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

/** Topic the hooks page's feed refreshes on. */
export const HOOKS_TOPIC = "playground:hooks";
const LOG_SIZE = 30;

/** One line of the hooks feed: what fired, and what it carried. */
export interface HookEvent {
  icon: string;
  title: string;
  detail: string;
  tone?: Tone;
}

const events: ActivityFeedItem[] = [];
let eventCount = 0;

/**
 * Appends an event to the feed the hooks page shows (newest first, the last
 * thirty kept in memory) and tells the page to read it again. Answers
 * `undefined`, the result a hook handler's signature asks for.
 */
export function recordHookEvent(event: HookEvent): undefined {
  eventCount += 1;
  events.unshift({
    id: String(eventCount),
    icon: event.icon,
    tone: event.tone,
    title: event.title,
    detail: event.detail,
    date: new Date().toISOString(),
  });
  events.splice(LOG_SIZE);
  fireAndForget(PublishMessage(HOOKS_TOPIC, event.title), "hooks feed refresh");
  return undefined;
}

export function hookEvents(): ActivityFeedItem[] {
  return events;
}
