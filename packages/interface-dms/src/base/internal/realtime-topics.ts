import type { ComponentBuilder } from "../../component";
import type { PageMetadata } from "../../page";
import { RegisterPageTopic } from "../../realtime";

/**
 * The topics a block's `realtimeTopic` option names, as a list.
 *
 * @internal
 */
export function normalizeRealtimeTopics(
  topic: string | string[] | undefined,
): string[] {
  if (!topic) return [];
  return Array.isArray(topic) ? topic : [topic];
}

/**
 * Bind the topics a block refetches on to the page it is placed on: they are
 * the allowlist a session's subscriptions are checked against. Registered from
 * the builder's `onCreated`, so the module whose page it is owns them.
 *
 * @internal
 */
export function attachRealtimeTopicsHook<TProps>(
  builder: ComponentBuilder<TProps>,
  topic: string | string[] | undefined,
): ComponentBuilder<TProps> {
  const topics = normalizeRealtimeTopics(topic);
  if (topics.length === 0) return builder;
  return builder.onCreated((parentPage: PageMetadata) => {
    const parentInfo = parentPage.pageInfo;
    if (!parentInfo) return;
    for (const entry of topics) {
      RegisterPageTopic(parentInfo.fullId, entry);
    }
  });
}
