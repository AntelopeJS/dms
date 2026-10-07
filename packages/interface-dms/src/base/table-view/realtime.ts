import { InterfaceFunction } from "@antelopejs/interface-core";
import { realtimeMutationListeners } from "./internal/realtime-listeners";
const ROW_TOPIC_PREFIX = "tableview:row:";
const PRESENCE_TOPIC_PREFIX = "tableview:presence:";

export type RealtimeMutationEventType = "created" | "updated" | "deleted";

export interface RealtimeMutationContext {
  controllerLocation: string;
  rowIdKey: string;
  eventType: RealtimeMutationEventType;
  ids: string[];
  sessionId?: string;
  actor?: RealtimePresenceActor;
}

export interface RealtimePresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface RealtimePresenceContext {
  controllerLocation: string;
  rowIdKey: string;
  sessionId: string;
  rowId: string;
  actor: RealtimePresenceActor;
}

/**
 * The topic the row changes of the table view served at `controllerLocation`
 * are published on.
 */
export function tableViewRowTopic(controllerLocation: string): string {
  return `${ROW_TOPIC_PREFIX}${controllerLocation}`;
}

/**
 * The topic the presence on the rows of the table view served at
 * `controllerLocation` is tracked on.
 */
export function tableViewPresenceTopic(controllerLocation: string): string {
  return `${PRESENCE_TOPIC_PREFIX}${controllerLocation}`;
}

/**
 * @internal
 */
export namespace internal {
  /** Delivers a mutation of a table view's rows to the sessions watching it. */
  export const PublishMutation =
    InterfaceFunction<(context: RealtimeMutationContext) => Promise<void>>();

  /** Records that a session holds a row of a table view open. */
  export const AcquirePresence =
    InterfaceFunction<(context: RealtimePresenceContext) => Promise<void>>();
}

/** Called after a table view row mutation is published; see `registerRealtimeMutationListener`. */
export type RealtimeMutationListener = (
  context: RealtimeMutationContext,
) => void | Promise<void>;

/**
 * Register an additional realtime-mutation listener. Listeners are additive
 * side observers: they run after the DMS has published the mutation, and their
 * failures are logged, never propagated to the mutating request.
 *
 * The listener belongs to the module generation that registers it and is
 * released when that generation is destroyed, so a reloaded module does not
 * leave its previous listener behind. Registering one already registered is a
 * no-op.
 */
export function registerRealtimeMutationListener(
  listener: RealtimeMutationListener,
): void {
  if (realtimeMutationListeners.has((registered) => registered === listener)) {
    return;
  }
  realtimeMutationListeners.add(listener);
}

/** Drop a listener, for a module that stops listening while it stays loaded. */
export function unregisterRealtimeMutationListener(
  listener: RealtimeMutationListener,
): void {
  realtimeMutationListeners.remove((registered) => registered === listener);
}
