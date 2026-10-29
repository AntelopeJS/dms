import { EventEmitter } from "node:events";
import { Logging } from "@antelopejs/interface-core/logging";

const NO_LISTENER_LIMIT = 0;

export interface RealtimeEvent {
  topic: string;
  type: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Realtime transports module-defined payloads without interpreting them; changing this exported contract would restrict publishers.
  payload?: Record<string, unknown>;
  actorId?: string;
  /** The tenant the event is about; absent on an event for every tenant. */
  tenantId?: string;
  ts: number;
}

/** The view of a session that receives the events of every tenant. */
export const EVERY_TENANT = Symbol("every tenant");

/**
 * The tenants a session receives the events of: those of one tenant (with
 * the global ones), or {@link EVERY_TENANT}.
 */
export type TenantView = string | undefined | typeof EVERY_TENANT;

/**
 * Whether a session viewing `view` receives `event`: a global event reaches
 * every session, a tenant's event the sessions of that tenant and those that
 * view every tenant.
 */
export function isEventForTenant(
  event: { tenantId?: string },
  view: TenantView,
): boolean {
  return (
    view === EVERY_TENANT ||
    event.tenantId === undefined ||
    event.tenantId === view
  );
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

  async publish(event: RealtimeEvent): Promise<void> {
    for (const handler of this.emitter.listeners(event.topic)) {
      try {
        const result: unknown = handler(event);
        if (result instanceof Promise) {
          result.catch((error) =>
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
