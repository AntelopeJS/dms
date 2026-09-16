import { GetInterfaceInstances } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  InMemoryBroker,
  type RealtimeBroker,
  type RealtimeEventHandler,
  type Unsubscribe,
} from "./broker";
import {
  listLiveInstanceIds,
  type StopHeartbeat,
  startHeartbeat,
} from "./heartbeat";
import {
  getPresenceTracker,
  getRealtimeBroker,
  setCurrentRealtime,
} from "./current";
import { instanceId } from "./instance";
import { RedisBroker } from "./redis-broker";
import { installTableViewRealtimeBridge } from "./tableview-bridge";

export * from "./broker";
// Only the readers: setCurrentRealtime does not migrate subscriptions and
// must not be reachable from outside this module.
export { getPresenceTracker, getRealtimeBroker } from "./current";
export * from "./instance";
export * from "./presence";
export * from "./redis-broker";
export * from "./registry";
export * from "./sse";

export type RealtimeDriver = "redis" | "memory" | "auto";
type ResolvedDriver = "redis" | "memory";

export interface RealtimeConfig {
  driver?: RealtimeDriver;
}

const DEFAULT_DRIVER: RealtimeDriver = "auto";
const REDIS_INTERFACE_ID = "@antelopejs/interface-redis";

const driverFactories: Record<ResolvedDriver, () => RealtimeBroker> = {
  memory: () => new InMemoryBroker(),
  redis: () => new RedisBroker(),
};

const isRedisInterfaceAvailable = (): boolean => {
  try {
    return GetInterfaceInstances(REDIS_INTERFACE_ID).length > 0;
  } catch {
    return false;
  }
};

const driverResolvers: Record<RealtimeDriver, () => ResolvedDriver> = {
  memory: () => "memory",
  redis: () => "redis",
  auto: () => (isRedisInterfaceAvailable() ? "redis" : "memory"),
};

let stopHeartbeatFn: StopHeartbeat | undefined;

interface TrackedSubscription {
  topic: string;
  handler: RealtimeEventHandler;
  detach: Unsubscribe;
}

const trackedSubscriptions = new Map<number, TrackedSubscription>();
let nextSubscriptionId = 0;

/**
 * Subscribe to a topic across broker swaps.
 *
 * `configureRealtime()` installs a fresh broker at `start()` and closes the
 * previous one, which drops the listeners registered against it. A subscriber
 * that held a raw `getRealtimeBroker().subscribe()` handle would go silently
 * dead there — the common case being a consumer module subscribing from its
 * `construct()`, before the DMS started. Subscriptions taken here are replayed
 * onto every broker that follows.
 *
 * @param topic Topic to receive
 * @param handler Called for each event published on the topic
 * @returns Ends the subscription; calling it again is a no-op
 */
export function subscribeRealtime(
  topic: string,
  handler: RealtimeEventHandler,
): Unsubscribe {
  const id = nextSubscriptionId++;
  trackedSubscriptions.set(id, {
    topic,
    handler,
    detach: getRealtimeBroker().subscribe(topic, handler),
  });
  return () => {
    const tracked = trackedSubscriptions.get(id);
    if (!tracked) return;
    trackedSubscriptions.delete(id);
    tracked.detach();
  };
}

export function setRealtimeBroker(broker: RealtimeBroker): void {
  const previousBroker = setCurrentRealtime(broker);
  if (previousBroker === broker) return;
  for (const tracked of trackedSubscriptions.values()) {
    // Each entry is moved independently: one broker refusing a topic must not
    // leave the entries after it attached to the broker about to be closed.
    try {
      tracked.detach();
    } catch (error) {
      Logging.Warn("Realtime: detaching a subscription on swap failed", error);
    }
    try {
      tracked.detach = broker.subscribe(tracked.topic, tracked.handler);
    } catch (error) {
      tracked.detach = () => {};
      Logging.Error(
        "Realtime: re-attaching a subscription on swap failed",
        error,
      );
    }
  }
}

export async function configureRealtime(
  config?: RealtimeConfig,
): Promise<void> {
  // Installed here rather than at module scope: the bridge calls back into
  // table-view, which may still be mid-evaluation when a consumer's first
  // entry into the package is the table-view interface subpath.
  installTableViewRealtimeBridge();
  if (stopHeartbeatFn) {
    try {
      await stopHeartbeatFn();
    } catch (error) {
      Logging.Warn("Realtime: heartbeat stop on reconfigure failed", error);
    }
    stopHeartbeatFn = undefined;
  }
  const previousBroker = getRealtimeBroker();
  const requested = config?.driver ?? DEFAULT_DRIVER;
  const resolved = driverResolvers[requested]();
  setRealtimeBroker(driverFactories[resolved]());
  if (previousBroker !== getRealtimeBroker()) {
    try {
      await previousBroker.close?.();
    } catch (error) {
      Logging.Warn("Realtime: previous broker close failed", error);
    }
  }
  const kv = getRealtimeBroker().getKvStore?.();
  if (!kv) return;
  try {
    stopHeartbeatFn = await startHeartbeat(kv, instanceId);
    const live = await listLiveInstanceIds(kv);
    await getPresenceTracker().sweepStaleInstances(live);
  } catch (error) {
    Logging.Warn("Realtime: heartbeat/sweep failed on startup", error);
  }
}

export async function stopRealtime(): Promise<void> {
  if (stopHeartbeatFn) {
    try {
      await stopHeartbeatFn();
    } catch (error) {
      Logging.Warn("Realtime: heartbeat stop failed", error);
    }
    stopHeartbeatFn = undefined;
  }
  await getRealtimeBroker().close?.();
}
