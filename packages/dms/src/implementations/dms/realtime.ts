import type {
  PublishMessageOptions,
  RealtimeMessageHandler,
} from "@antelopejs/interface-dms/realtime";
import {
  getRealtimeBroker,
  registerPageTopic,
  subscribeRealtime,
  unregisterPageTopic,
} from "../../realtime";
import type { Unsubscribe } from "../../realtime/broker";

interface PageTopicBinding {
  pageId: string;
  topic: string;
}

const messageSubscriptions = new Map<string, Unsubscribe>();
// The core hands `unregister` nothing but the registration id, and each id
// names one topic of one page.
const pageTopicBindings = new Map<string, PageTopicBinding>();

export namespace internal {
  export const RegisterPageTopic = {
    register: (id: string, pageId: string, topic: string): void => {
      pageTopicBindings.set(id, { pageId, topic });
      registerPageTopic(pageId, topic);
    },
    unregister: (id: string): void => {
      const binding = pageTopicBindings.get(id);
      if (!binding) return;
      pageTopicBindings.delete(id);
      unregisterPageTopic(binding.pageId, binding.topic);
    },
  };

  export const SubscribeMessage = {
    register: (
      id: string,
      topic: string,
      handler: RealtimeMessageHandler,
    ): void => {
      // Re-registering an id replaces its subscription: dropping the handle
      // without detaching would strand the previous one in the tracked set,
      // where it is replayed onto every later broker with nothing left to
      // remove it — a module reload would keep delivering to the handler of
      // the torn-down instance.
      messageSubscriptions.get(id)?.();
      messageSubscriptions.set(id, subscribeRealtime(topic, handler));
    },
    unregister: (id: string): void => {
      messageSubscriptions.get(id)?.();
      messageSubscriptions.delete(id);
    },
  };
}

export async function PublishMessage(
  topic: string,
  type: string,
  options?: PublishMessageOptions,
): Promise<void> {
  await getRealtimeBroker().publish({
    topic,
    type,
    payload: options?.payload,
    actorId: options?.actorId,
    ts: Date.now(),
  });
}
