import {
  type RealtimeMutationContext,
  type RealtimeMutationEventType,
  type RealtimePresenceContext,
  tableViewPresenceTopic,
  tableViewRowTopic,
} from "@antelopejs/interface-dms/base/table-view";
import { getPresenceTracker, getRealtimeBroker } from "./current";

// A writer that changed or removed a row is done with it: the presence it held
// there goes with the write.
const PRESENCE_RELEASING_EVENTS: ReadonlySet<RealtimeMutationEventType> =
  new Set(["updated", "deleted"]);

/**
 * Publish a table-view mutation on the table's row topic, and release the
 * presence the writing session held on the rows it changed.
 */
export async function publishTableViewMutation({
  controllerLocation,
  eventType,
  ids,
  sessionId,
  actor,
}: RealtimeMutationContext): Promise<void> {
  await getRealtimeBroker().publish({
    topic: tableViewRowTopic(controllerLocation),
    type: eventType,
    payload: { ids },
    actorId: actor?.id,
    ts: Date.now(),
  });
  if (!sessionId || !PRESENCE_RELEASING_EVENTS.has(eventType)) return;
  const presenceTopic = tableViewPresenceTopic(controllerLocation);
  const tracker = getPresenceTracker();
  await Promise.all(
    ids.map((id) => tracker.release(sessionId, presenceTopic, id)),
  );
}

/** Record that a session holds a row of a table view open. */
export async function acquireTableViewPresence({
  controllerLocation,
  sessionId,
  rowId,
  actor,
}: RealtimePresenceContext): Promise<void> {
  await getPresenceTracker().acquire(
    sessionId,
    tableViewPresenceTopic(controllerLocation),
    rowId,
    actor,
  );
}
