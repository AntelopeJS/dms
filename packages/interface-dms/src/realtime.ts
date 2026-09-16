import { randomUUID } from "node:crypto";
import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

export interface PublishMessageOptions {
  payload?: Record<string, unknown>;
  actorId?: string;
}

/** One message delivered to a {@link SubscribeMessage} handler. */
export interface RealtimeMessage {
  topic: string;
  type: string;
  payload?: Record<string, unknown>;
  actorId?: string;
  ts: number;
}

export type RealtimeMessageHandler = (message: RealtimeMessage) => void;

/** Ends the subscription; calling it again is a no-op. */
export type UnsubscribeMessage = () => void;

/**
 * @internal
 */
export namespace internal {
  export const RegisterPageTopic = new RegisteringProxy<
    (pageId: string, topic: string) => void
  >();

  export const SubscribeMessage = new RegisteringProxy<
    (id: string, topic: string, handler: RealtimeMessageHandler) => void
  >();
}

export const RegisterPageTopic = (pageId: string, topic: string): void => {
  internal.RegisterPageTopic.register(pageId, topic);
};

export const PublishMessage =
  InterfaceFunction<
    (
      topic: string,
      type: string,
      options?: PublishMessageOptions,
    ) => Promise<void>
  >();

/**
 * Receive every message published on `topic`, whichever instance published it:
 * the subscription rides the same broker as {@link PublishMessage}, so what one
 * instance publishes reaches the subscribers of every other.
 *
 * The read half of the message interface. {@link PublishMessage} alone lets a
 * module feed the DMS's own streams; paired with this, a module can serve
 * realtime channels of its own — its endpoint subscribes here, the DMS carries
 * the messages — instead of bringing a second broker for the same job.
 *
 * Handlers are called on the delivering instance's event loop and must not
 * throw. Delivery is fire-and-forget: there is no replay, a message published
 * while nobody was subscribed is gone.
 *
 * The subscription is removed automatically when the registering module is
 * unloaded.
 */
export function SubscribeMessage(
  topic: string,
  handler: RealtimeMessageHandler,
): UnsubscribeMessage {
  const id = randomUUID();
  internal.SubscribeMessage.register(id, topic, handler);
  return () => internal.SubscribeMessage.unregister(id);
}
