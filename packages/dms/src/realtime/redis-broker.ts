import { Logging } from "@antelopejs/interface-core/logging";
import { GetClient } from "@antelopejs/interface-redis";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import {
  InMemoryBroker,
  type KvStore,
  type RealtimeBroker,
  type RealtimeEvent,
  type RealtimeEventHandler,
  type Unsubscribe,
} from "./broker";

type RedisClient = Awaited<ReturnType<typeof GetClient>>;

const REDIS_CHANNEL = "dms:realtime";
const SCAN_BATCH_SIZE = 100;

const buildKvStore = (
  ensureInit: () => Promise<void>,
  getClient: () => RedisClient | undefined,
): KvStore => ({
  async hset(hash, field, value) {
    await ensureInit();
    const client = getClient();
    if (!client) return;
    await client.hset(hash, field, value);
  },
  async hdel(hash, fields) {
    if (fields.length === 0) return;
    await ensureInit();
    const client = getClient();
    if (!client) return;
    await client.hdel(hash, ...fields);
  },
  async hget(hash, field) {
    await ensureInit();
    const client = getClient();
    if (!client) return undefined;
    return (await client.hget(hash, field)) ?? undefined;
  },
  async hgetall(hash) {
    await ensureInit();
    const client = getClient();
    if (!client) return {};
    return (await client.hgetall(hash)) ?? {};
  },
  async scan(pattern) {
    await ensureInit();
    const client = getClient();
    if (!client) return [];
    const found: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        SCAN_BATCH_SIZE,
      );
      found.push(...batch);
      cursor = next;
    } while (cursor !== "0");
    return found;
  },
  async setex(key, seconds, value) {
    await ensureInit();
    const client = getClient();
    if (!client) return;
    await client.setex(key, seconds, value);
  },
  async del(keys) {
    if (keys.length === 0) return;
    await ensureInit();
    const client = getClient();
    if (!client) return;
    await client.del(...keys);
  },
});

const isRealtimeEvent = (value: unknown): value is RealtimeEvent =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Record<string, unknown>).topic === "string" &&
  typeof (value as Record<string, unknown>).type === "string";

export class RedisBroker implements RealtimeBroker {
  private readonly local = new InMemoryBroker();
  private publisher?: RedisClient;
  private subscriber?: RedisClient;
  private initPromise?: Promise<void>;

  private async ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    const client = await GetClient();
    this.publisher = client;
    this.subscriber = client.duplicate();
    this.subscriber.on("message", (_channel: string, message: string) =>
      this.dispatchMessage(message),
    );
    await this.subscriber.subscribe(REDIS_CHANNEL);
  }

  private dispatchMessage(message: string): void {
    try {
      const event = JSON.parse(message);
      if (!isRealtimeEvent(event)) return;
      fireAndForget(this.local.publish(event), "realtime event dispatch");
    } catch (error) {
      Logging.Warn("RedisBroker: failed to parse incoming message", error);
    }
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.ensureInit();
    if (!this.publisher) return;
    await this.publisher.publish(REDIS_CHANNEL, JSON.stringify(event));
  }

  subscribe(topic: string, handler: RealtimeEventHandler): Unsubscribe {
    fireAndForget(this.ensureInit(), "redis broker initialization");
    return this.local.subscribe(topic, handler);
  }

  getKvStore(): KvStore {
    return buildKvStore(
      () => this.ensureInit(),
      () => this.publisher,
    );
  }

  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(REDIS_CHANNEL);
      await this.subscriber.quit();
    }
    await this.local.close?.();
  }
}
