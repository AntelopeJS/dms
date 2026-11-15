import { vi } from "vitest";
import type {
  CrossTabEnvironment,
  TabMessageHandler,
} from "../../layers/dms-core/app/entries/utils/crossTab";
import { isFunction } from "../../layers/dms-core/app/utils/type-check";

/**
 * One browser profile for the cross-tab tests: the Web Locks every tab shares
 * and the BroadcastChannels they talk on, delivered in a microtask.
 */

type LockCallback<Result> = (lock: Lock | null) => Result;

interface Waiter {
  start: () => void;
}

class FakeLockManager implements LockManager {
  private readonly held = new Set<string>();
  private readonly queues = new Map<string, Waiter[]>();

  query(): Promise<LockManagerSnapshot> {
    const lock = (name: string): LockInfo => ({ name, mode: "exclusive" });
    return Promise.resolve({
      held: [...this.held].map(lock),
      pending: [...this.queues].flatMap(([name, queue]) =>
        queue.map(() => lock(name)),
      ),
    });
  }

  request<Result>(
    name: string,
    critical: LockCallback<Result>,
  ): Promise<Result>;
  request<Result>(
    name: string,
    options: LockOptions,
    critical: LockCallback<Result>,
  ): Promise<Result>;
  request<Result>(
    name: string,
    optionsOrCritical: LockOptions | LockCallback<Result>,
    only?: LockCallback<Result>,
  ): Promise<Result> {
    const critical = isFunction(optionsOrCritical) ? optionsOrCritical : only;
    const options = isFunction(optionsOrCritical) ? {} : optionsOrCritical;
    if (!critical) throw new TypeError("A lock request needs a callback");
    return new Promise((resolve, reject) => {
      const { signal } = options;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const waiter: Waiter = {
        start: () => {
          signal?.removeEventListener("abort", onAbort);
          this.held.add(name);
          Promise.resolve()
            .then(() => critical({ name, mode: "exclusive" }))
            .then(resolve, reject)
            .finally(() => this.release(name));
        },
      };
      const onAbort = () => {
        const queue = this.queues.get(name) ?? [];
        const index = queue.indexOf(waiter);
        if (index === -1) return;
        queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort);
      const queue = this.queues.get(name) ?? [];
      this.queues.set(name, queue);
      queue.push(waiter);
      if (!this.held.has(name) && queue[0] === waiter) this.grantNext(name);
    });
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  private grantNext(name: string): void {
    const next = this.queues.get(name)?.shift();
    if (next) next.start();
  }

  private release(name: string): void {
    this.held.delete(name);
    this.grantNext(name);
  }
}

class FakeChannelHub {
  private readonly channels = new Set<FakeChannel>();

  join(channel: FakeChannel): void {
    this.channels.add(channel);
  }

  leave(channel: FakeChannel): void {
    this.channels.delete(channel);
  }

  deliver(
    sender: FakeChannel,
    message: Parameters<TabMessageHandler>[0],
  ): void {
    const data = structuredClone(message);
    for (const channel of this.channels) {
      if (channel === sender || channel.name !== sender.name) continue;
      queueMicrotask(() => channel.receive(data));
    }
  }
}

class FakeChannel extends EventTarget implements BroadcastChannel {
  onmessage: BroadcastChannel["onmessage"] = null;
  onmessageerror: BroadcastChannel["onmessageerror"] = null;
  private isClosed = false;

  constructor(
    readonly name: string,
    private readonly hub: FakeChannelHub,
  ) {
    super();
    hub.join(this);
  }

  postMessage(message: Parameters<TabMessageHandler>[0]): void {
    if (this.isClosed) return;
    this.hub.deliver(this, message);
  }

  receive(data: Parameters<TabMessageHandler>[0]): void {
    if (!this.isClosed) this.onmessage?.(new MessageEvent("message", { data }));
  }

  close(): void {
    this.isClosed = true;
    this.hub.leave(this);
  }
}

export interface FakeTab {
  environment: CrossTabEnvironment;
  /** Makes the browser APIs `browserCrossTabEnvironment()` reads this tab's. */
  activate(): void;
  /**
   * The tab goes without a word: nothing it posts reaches another tab any
   * more. Its locks go with the code that tears it down.
   */
  cut(): void;
}

export interface FakeBrowser {
  locks: FakeLockManager;
  openTab(): FakeTab;
}

export function createFakeBrowser(): FakeBrowser {
  const locks = new FakeLockManager();
  const hub = new FakeChannelHub();
  return {
    locks,
    openTab: () => {
      const channels = new Set<FakeChannel>();
      const createChannel = (name: string) => {
        const channel = new FakeChannel(name, hub);
        channels.add(channel);
        return channel;
      };
      const environment: CrossTabEnvironment = {
        locks,
        createChannel,
      };
      return {
        environment,
        activate: () => {
          vi.stubGlobal("navigator", { locks });
          vi.stubGlobal("BroadcastChannel", function TabChannel(name: string) {
            return createChannel(name);
          });
        },
        cut: () => {
          for (const channel of channels) channel.close();
        },
      };
    },
  };
}
