import type { RealtimeBroker } from "./broker";
import { InMemoryBroker } from "./broker";
import { instanceId } from "./instance";
import { PresenceTracker } from "./presence";

// The live broker and its presence tracker live here rather than in index.ts:
// the table-view bridge needs to read them, index.ts imports the bridge, and
// reading them from the barrel closed a cycle between the two.

let currentBroker: RealtimeBroker = new InMemoryBroker();
let currentPresence: PresenceTracker = new PresenceTracker(
  currentBroker,
  instanceId,
);

export const getRealtimeBroker = (): RealtimeBroker => currentBroker;
export const getPresenceTracker = (): PresenceTracker => currentPresence;

/**
 * Swaps the live pair. Deliberately not exported from the package: it does not
 * migrate the tracked subscriptions, so calling it instead of
 * `setRealtimeBroker` leaves every SSE client attached to the old broker while
 * publishes go to the new one -- silently.
 */
export function setCurrentRealtime(broker: RealtimeBroker): RealtimeBroker {
  const previousBroker = currentBroker;
  currentBroker = broker;
  currentPresence = new PresenceTracker(
    broker,
    instanceId,
    broker.getKvStore?.(),
  );
  return previousBroker;
}
