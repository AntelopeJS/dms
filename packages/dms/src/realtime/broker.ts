import { EventEmitter } from "node:events";
import { Logging } from "@antelopejs/interface-core/logging";

const NO_LISTENER_LIMIT = 0;

export interface RealtimeEvent {
  topic: string;
  type: string;
  payload?: Record<string, unknown>;
  actorId?: string;
  ts: number;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;
export type Unsubscribe = () => void;

export interface KvStore {
  hset(hash: string, field: string, value: string): Promise<void>;
  hget(hash: string, field: string): Promise<string | undefined>;
  hdel(hash: string, fields: string[]): Promise<void>;
  hgetall(hash: string): Promise<Record<string, string>>;
  scan(pattern: string): Promise<string[]>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(keys: string[]): Promise<void>;
}

export interface RealtimeBroker {
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(topic: string, handler: RealtimeEventHandler): Unsubscribe;
  getKvStore?(): KvStore | undefined;
  close?(): Promise<void>;
}

export class InMemoryBroker implements RealtimeBroker {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(NO_LISTENER_LIMIT);
  }

  // Delivery is isolated per handler: `emit` would stop at the first listener
  // that throws and rethrow into the publisher, so one bad subscriber would
  // both starve the handlers registered after it and fail the request that
  // published (a table-view mutation awaits its publish after the DB write).
  async publish(event: RealtimeEvent): Promise<void> {
    // `listeners()` already returns a fresh array, so unsubscribing inside a
    // handler cannot disturb this loop.
    for (const handler of this.emitter.listeners(event.topic)) {
      try {
        // A handler is typed `=> void`, which an async function satisfies:
        // its rejection lands outside the catch and would reach the process
        // as an unhandled rejection, so the returned value is settled too.
        const result = (handler as RealtimeEventHandler)(event) as unknown;
        if (result instanceof Promise) {
          result.catch((error: unknown) =>
            Logging.Error("Realtime: subscriber handler rejected", error),
          );
        }
      } catch (error) {
        Logging.Error("Realtime: subscriber handler threw", error);
      }
    }
  }

  subscribe(topic: string, handler: RealtimeEventHandler): Unsubscribe {
    this.emitter.on(topic, handler);
    return () => this.emitter.off(topic, handler);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
