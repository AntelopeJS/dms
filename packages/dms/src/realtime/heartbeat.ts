import { Logging } from "@antelopejs/interface-core/logging";
import type { KvStore } from "./broker";

const HEARTBEAT_KEY_PREFIX = "dms:realtime:instance:";
const HEARTBEAT_TTL_SECONDS = 60;
const HEARTBEAT_REFRESH_MS = 20_000;
const HEARTBEAT_VALUE = "1";

export const heartbeatKey = (instanceId: string): string =>
  `${HEARTBEAT_KEY_PREFIX}${instanceId}`;

export type StopHeartbeat = () => Promise<void>;

export async function startHeartbeat(
  kv: KvStore,
  instanceId: string,
): Promise<StopHeartbeat> {
  const key = heartbeatKey(instanceId);
  await kv.setex(key, HEARTBEAT_TTL_SECONDS, HEARTBEAT_VALUE);
  const timer = setInterval(() => {
    kv.setex(key, HEARTBEAT_TTL_SECONDS, HEARTBEAT_VALUE).catch((error) =>
      Logging.Warn("Realtime: heartbeat refresh failed", error),
    );
  }, HEARTBEAT_REFRESH_MS);
  timer.unref?.();
  return async () => {
    clearInterval(timer);
    await kv.del([key]);
  };
}

export async function listLiveInstanceIds(kv: KvStore): Promise<Set<string>> {
  const keys = await kv.scan(`${HEARTBEAT_KEY_PREFIX}*`);
  const ids = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(HEARTBEAT_KEY_PREFIX)) {
      ids.add(key.slice(HEARTBEAT_KEY_PREFIX.length));
    }
  }
  return ids;
}
