import type {
  PublishMessageOptions,
  RealtimeMessageHandler,
} from "@antelopejs/interface-dms/realtime";
import {
  clearPageTopics,
  getRealtimeBroker,
  registerPageTopic,
  subscribeRealtime,
} from "../../realtime";
import type { Unsubscribe } from "../../realtime/broker";

const messageSubscriptions = new Map<string, Unsubscribe>();

export namespace internal {
  export const RegisterPageTopic = {
    register: (pageId: string, topic: string): void => {
      registerPageTopic(pageId, topic);
    },
    unregister: (pageId: string): void => {
      clearPageTopics(pageId);
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
