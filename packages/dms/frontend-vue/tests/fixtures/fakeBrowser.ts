import { vi } from "vitest";
import type {
  CrossTabEnvironment,
  TabMessageHandler,
} from "../../layers/dms-core/app/entries/utils/crossTab";

/**
 * One browser profile for the cross-tab tests: the Web Locks every tab shares
 * and the BroadcastChannels they talk on, delivered in a microtask.
 */

type LockCallback<Result> = (lock: { name: string }) => Result;

interface Waiter {
  start: () => void;
}

class FakeLockManager {
  private readonly held = new Set<string>();
  private readonly queues = new Map<string, Waiter[]>();

  request<Result>(
    name: string,
    options: { signal?: AbortSignal },
    callback: LockCallback<Result>,
  ): Promise<Result> {
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
            // oxlint-disable-next-line promise/no-callback-in-promise -- The fake Web Locks API must invoke its caller's callback only after the queued lock is granted.
            .then(() => callback({ name }))
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
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot recipients before queuing deliveries so channel membership changes do not alter this broadcast.
    for (const channel of [...this.channels]) {
      if (channel === sender || channel.name !== sender.name) continue;
      queueMicrotask(() => channel.receive(data));
    }
  }
}

class FakeChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  private isClosed = false;

  constructor(
    readonly name: string,
    private readonly hub: FakeChannelHub,
  ) {
    hub.join(this);
  }

  postMessage(message: Parameters<TabMessageHandler>[0]): void {
    if (this.isClosed) return;
    this.hub.deliver(this, message);
  }

  receive(
    data: Parameters<NonNullable<FakeChannel["onmessage"]>>[0]["data"],
  ): void {
    if (!this.isClosed) this.onmessage?.({ data });
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
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The owner requires the full DOM EventTarget API, but this fake intentionally implements only crossTab's channel subset; its private hub prevents a direct structural cast.
        return channel as unknown as BroadcastChannel;
      };
      const environment: CrossTabEnvironment = {
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The owner requires query and both request overloads; this queued fake implements only crossTab's three-argument request and has private state incompatible with a direct structural cast.
        locks: locks as unknown as LockManager,
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
