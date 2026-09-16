import { runInBatches } from "../utils/run-in-batches";
import type { KvStore, RealtimeBroker, RealtimeEvent } from "./broker";

export const PRESENCE_EVENT_TYPE = {
  ACQUIRED: "acquired",
  RELEASED: "released",
} as const;

const KEY_SEPARATOR = " ";
const PRESENCE_HASH_PREFIX = "dms:realtime:presence:";
const FIELD_SEPARATOR = "|";
const PRESENCE_PUBLISH_BATCH_SIZE = 20;

export interface PresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface PresenceEntry {
  topic: string;
  rowId: string;
  actor: PresenceActor;
  sessionId: string;
  instanceId: string;
  since: number;
}

const buildKey = (topic: string, rowId: string, sessionId: string): string =>
  `${topic}${KEY_SEPARATOR}${rowId}${KEY_SEPARATOR}${sessionId}`;

const buildField = (rowId: string, sessionId: string): string =>
  `${rowId}${FIELD_SEPARATOR}${sessionId}`;

const presenceHashKey = (topic: string): string =>
  `${PRESENCE_HASH_PREFIX}${topic}`;

const buildActorRowKey = (
  topic: string,
  rowId: string,
  actorId: string,
): string => JSON.stringify([topic, rowId, actorId]);

const presenceEvent = (
  type: (typeof PRESENCE_EVENT_TYPE)[keyof typeof PRESENCE_EVENT_TYPE],
  entry: PresenceEntry,
): RealtimeEvent => ({
  topic: entry.topic,
  type,
  payload: {
    rowId: entry.rowId,
    actor: entry.actor,
    sessionId: entry.sessionId,
    since: entry.since,
  },
  actorId: entry.actor.id,
  ts: Date.now(),
});

const parsePresenceEntry = (value: string): PresenceEntry | undefined => {
  try {
    const parsed = JSON.parse(value) as PresenceEntry;
    if (
      typeof parsed.topic === "string" &&
      typeof parsed.rowId === "string" &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.instanceId === "string" &&
      parsed.actor &&
      typeof parsed.actor.id === "string"
    ) {
      return parsed;
    }
  } catch {}
  return undefined;
};

export class PresenceTracker {
  private readonly entries = new Map<string, PresenceEntry>();
  private readonly keysBySession = new Map<string, Set<string>>();
  private readonly keysByActorRow = new Map<string, Set<string>>();

  constructor(
    private readonly broker: RealtimeBroker,
    private readonly localInstanceId: string,
    private readonly kv?: KvStore,
  ) {}

  async acquire(
    sessionId: string,
    topic: string,
    rowId: string,
    actor: PresenceActor,
  ): Promise<void> {
    const key = buildKey(topic, rowId, sessionId);
    if (this.entries.has(key)) return;
    await this.releaseOtherSessionsForActor(topic, rowId, actor.id, sessionId);
    const entry: PresenceEntry = {
      topic,
      rowId,
      actor,
      sessionId,
      instanceId: this.localInstanceId,
      since: Date.now(),
    };
    this.trackEntry(key, entry);
    if (this.kv) {
      await this.kv.hset(
        presenceHashKey(topic),
        buildField(rowId, sessionId),
        JSON.stringify(entry),
      );
    }
    await this.broker.publish(
      presenceEvent(PRESENCE_EVENT_TYPE.ACQUIRED, entry),
    );
  }

  private async releaseOtherSessionsForActor(
    topic: string,
    rowId: string,
    actorId: string,
    keepSessionId: string,
  ): Promise<void> {
    const stale: PresenceEntry[] = [];
    const actorRowKey = buildActorRowKey(topic, rowId, actorId);
    for (const key of this.keysByActorRow.get(actorRowKey) ?? []) {
      const entry = this.entries.get(key);
      if (entry && entry.sessionId !== keepSessionId) stale.push(entry);
    }
    for (const entry of stale) {
      const key = buildKey(entry.topic, entry.rowId, entry.sessionId);
      this.untrackEntry(key, entry);
      if (this.kv) {
        await this.kv.hdel(presenceHashKey(entry.topic), [
          buildField(entry.rowId, entry.sessionId),
        ]);
      }
      await this.broker.publish(
        presenceEvent(PRESENCE_EVENT_TYPE.RELEASED, entry),
      );
    }
  }

  async release(
    sessionId: string,
    topic: string,
    rowId: string,
    requireActorId?: string,
  ): Promise<void> {
    const key = buildKey(topic, rowId, sessionId);
    let entry = this.entries.get(key);
    if (!entry && this.kv) {
      const raw = await this.kv.hget(
        presenceHashKey(topic),
        buildField(rowId, sessionId),
      );
      if (raw) entry = parsePresenceEntry(raw);
    }
    if (!entry) return;
    if (requireActorId && entry.actor.id !== requireActorId) return;
    this.untrackEntry(key, entry);
    if (this.kv) {
      await this.kv.hdel(presenceHashKey(topic), [
        buildField(rowId, sessionId),
      ]);
    }
    await this.broker.publish(
      presenceEvent(PRESENCE_EVENT_TYPE.RELEASED, entry),
    );
  }

  async releaseAllForSession(sessionId: string): Promise<void> {
    const localKeys = this.keysBySession.get(sessionId);
    this.keysBySession.delete(sessionId);
    const fieldsByTopic = new Map<string, string[]>();
    const released: PresenceEntry[] = [];
    if (localKeys) {
      for (const key of localKeys) {
        const entry = this.entries.get(key);
        if (!entry) continue;
        this.untrackEntry(key, entry);
        released.push(entry);
        if (!this.kv) continue;
        const hash = presenceHashKey(entry.topic);
        const list = fieldsByTopic.get(hash) ?? [];
        list.push(buildField(entry.rowId, entry.sessionId));
        fieldsByTopic.set(hash, list);
      }
    }
    if (this.kv) {
      const kv = this.kv;
      const remoteEntries = await this.collectRemoteEntriesForSession(
        sessionId,
        fieldsByTopic,
      );
      released.push(...remoteEntries);
      await Promise.all(
        Array.from(fieldsByTopic, ([hash, fields]) => kv.hdel(hash, fields)),
      );
    }
    await runInBatches(released, PRESENCE_PUBLISH_BATCH_SIZE, (entry) =>
      this.broker.publish(presenceEvent(PRESENCE_EVENT_TYPE.RELEASED, entry)),
    );
  }

  private async collectRemoteEntriesForSession(
    sessionId: string,
    fieldsByTopic: Map<string, string[]>,
  ): Promise<PresenceEntry[]> {
    if (!this.kv) return [];
    const fieldSuffix = `${FIELD_SEPARATOR}${sessionId}`;
    const remoteEntries: PresenceEntry[] = [];
    const hashKeys = await this.kv.scan(`${PRESENCE_HASH_PREFIX}*`);
    for (const hashKey of hashKeys) {
      const raw = await this.kv.hgetall(hashKey);
      const queued = new Set(fieldsByTopic.get(hashKey) ?? []);
      for (const [field, value] of Object.entries(raw)) {
        if (!field.endsWith(fieldSuffix) || queued.has(field)) continue;
        queued.add(field);
        const parsed = parsePresenceEntry(value);
        if (parsed) remoteEntries.push(parsed);
      }
      if (queued.size > 0) fieldsByTopic.set(hashKey, [...queued]);
    }
    return remoteEntries;
  }

  async snapshotForTopic(topic: string): Promise<PresenceEntry[]> {
    if (!this.kv) {
      const result: PresenceEntry[] = [];
      for (const entry of this.entries.values()) {
        if (entry.topic === topic) result.push(entry);
      }
      return result;
    }
    const raw = await this.kv.hgetall(presenceHashKey(topic));
    const result: PresenceEntry[] = [];
    for (const value of Object.values(raw)) {
      const parsed = parsePresenceEntry(value);
      if (parsed) result.push(parsed);
    }
    return result;
  }

  async sweepStaleInstances(liveInstanceIds: Set<string>): Promise<void> {
    if (!this.kv) return;
    const kv = this.kv;
    const hashKeys = await kv.scan(`${PRESENCE_HASH_PREFIX}*`);
    for (const hashKey of hashKeys) {
      const raw = await kv.hgetall(hashKey);
      const staleFields: string[] = [];
      const staleEntries: PresenceEntry[] = [];
      for (const [field, value] of Object.entries(raw)) {
        const parsed = parsePresenceEntry(value);
        if (!parsed) {
          staleFields.push(field);
          continue;
        }
        if (!liveInstanceIds.has(parsed.instanceId)) {
          staleFields.push(field);
          staleEntries.push(parsed);
        }
      }
      if (staleFields.length === 0) continue;
      await kv.hdel(hashKey, staleFields);
      await runInBatches(staleEntries, PRESENCE_PUBLISH_BATCH_SIZE, (entry) =>
        this.broker.publish(presenceEvent(PRESENCE_EVENT_TYPE.RELEASED, entry)),
      );
    }
  }

  hasSession(sessionId: string): boolean {
    return this.keysBySession.has(sessionId);
  }

  private trackSessionKey(sessionId: string, key: string): void {
    let keys = this.keysBySession.get(sessionId);
    if (!keys) {
      keys = new Set();
      this.keysBySession.set(sessionId, keys);
    }
    keys.add(key);
  }

  private trackEntry(key: string, entry: PresenceEntry): void {
    this.entries.set(key, entry);
    this.trackSessionKey(entry.sessionId, key);
    const actorRowKey = buildActorRowKey(
      entry.topic,
      entry.rowId,
      entry.actor.id,
    );
    const keys = this.keysByActorRow.get(actorRowKey) ?? new Set<string>();
    keys.add(key);
    this.keysByActorRow.set(actorRowKey, keys);
  }

  private untrackEntry(key: string, entry: PresenceEntry): void {
    this.entries.delete(key);
    const sessionKeys = this.keysBySession.get(entry.sessionId);
    sessionKeys?.delete(key);
    if (sessionKeys?.size === 0) this.keysBySession.delete(entry.sessionId);
    const actorRowKey = buildActorRowKey(
      entry.topic,
      entry.rowId,
      entry.actor.id,
    );
    const actorKeys = this.keysByActorRow.get(actorRowKey);
    actorKeys?.delete(key);
    if (actorKeys?.size === 0) this.keysByActorRow.delete(actorRowKey);
  }
}
