import { isFunction } from "../../utils/type-check";
/**
 * Coordination between the tabs of one browser profile, for the long-lived
 * streams a dashboard keeps open.
 *
 * Over HTTP/1.1 a browser opens at most six connections per host, and a
 * streaming response holds one for as long as it lives: one stream per tab
 * starves every other request once a few tabs are open. One tab is elected
 * (a Web Lock, released by the browser when the tab goes, however it goes),
 * opens the stream, and relays it to the others over a BroadcastChannel.
 *
 * Web Locks need a secure context (HTTPS, or localhost). Where either API is
 * missing, every tab is its own leader on a bus of its own: the behaviour of a
 * stream per tab, unchanged.
 *
 * @internal
 */

const TAB_LOCK_SEPARATOR = ":tab:";

export type TabMessageHandler = (
  message: Parameters<typeof structuredClone>[0],
) => void;

/** The browser APIs the coordination rides on; injected by the tests. */
export interface CrossTabEnvironment {
  locks?: LockManager;
  createChannel?: (name: string) => BroadcastChannel;
}

export interface TabBus {
  /** Sends to every tab on the bus, this one included. */
  post(message: Parameters<TabMessageHandler>[0]): void;
  listen(handler: TabMessageHandler): () => void;
  close(): void;
}

/** A lock this tab holds until it releases it or goes. */
export interface HeldLock {
  /** Resolves once the lock is held: until then, nobody can wait on it. */
  held: Promise<void>;
  release(): void;
}

/** What the running browser offers. */
export function browserCrossTabEnvironment(): CrossTabEnvironment {
  const locks = globalThis.navigator?.locks;
  const canBroadcast = isFunction(globalThis.BroadcastChannel);
  if (!locks || !canBroadcast) return {};
  return { locks, createChannel: (name) => new BroadcastChannel(name) };
}

/** Whether the tabs can share: without both APIs each tab stays on its own. */
export function canShareAcrossTabs(environment: CrossTabEnvironment): boolean {
  return !!environment.locks && !!environment.createChannel;
}

export function openTabBus(
  name: string,
  environment: CrossTabEnvironment,
): TabBus {
  const listeners = new Set<TabMessageHandler>();
  const deliver = (message: Parameters<TabMessageHandler>[0]) => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- Delivery snapshots listeners so removals and additions during callbacks affect only subsequent messages; iterating the live Set changes that behavior.
    for (const listener of [...listeners]) listener(message);
  };
  const channel = canShareAcrossTabs(environment)
    ? environment.createChannel!(name)
    : undefined;
  if (channel) channel.onmessage = (event) => deliver(event.data);
  return {
    post: (message) => {
      channel?.postMessage(message);
      deliver(message);
    },
    listen: (handler) => {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    close: () => {
      listeners.clear();
      channel?.close();
    },
  };
}

/**
 * Runs `lead` in one tab at a time per `name`. When the leading tab resigns
 * or goes, the next waiting tab takes over and runs its own `lead`.
 *
 * @param lead Starts the leader's work; returns what stops it
 * @returns Resigns: stops the work when leading, or stops waiting
 */
export function electLeader(
  name: string,
  environment: CrossTabEnvironment,
  lead: () => () => void,
): () => void {
  if (!canShareAcrossTabs(environment)) return lead();
  const abort = new AbortController();
  let isResigned = false;
  let stepDown: (() => void) | undefined;
  environment
    .locks!.request(name, { signal: abort.signal }, () => {
      if (isResigned) return;
      return new Promise<void>((resolve) => {
        const stop = lead();
        stepDown = () => {
          stop();
          resolve();
        };
      });
    })
    .catch(() => {});
  return () => {
    isResigned = true;
    abort.abort();
    stepDown?.();
    stepDown = undefined;
  };
}

export function tabLockName(name: string, tabId: string): string {
  return `${name}${TAB_LOCK_SEPARATOR}${tabId}`;
}

/** Holds `name` until released; the browser releases it when the tab goes. */
export function holdLock(
  name: string,
  environment: CrossTabEnvironment,
): HeldLock {
  if (!canShareAcrossTabs(environment)) {
    return { held: Promise.resolve(), release: () => {} };
  }
  const abort = new AbortController();
  let release: (() => void) | undefined;
  let isReleased = false;
  const held = new Promise<void>((resolveHeld) => {
    environment
      .locks!.request(name, { signal: abort.signal }, () => {
        if (isReleased) return;
        resolveHeld();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {});
  });
  return {
    held,
    release: () => {
      isReleased = true;
      abort.abort();
      release?.();
      release = undefined;
    },
  };
}

/**
 * Calls `onReleased` once nobody holds `name` any more: when the tab holding
 * it releases it or goes. Never called once `signal` aborts.
 */
export function whenReleased(
  name: string,
  environment: CrossTabEnvironment,
  onReleased: () => void,
  signal: AbortSignal,
): void {
  if (!canShareAcrossTabs(environment)) return;
  environment
    .locks!.request(name, { signal }, () => {
      if (!signal.aborted) onReleased();
    })
    .catch(() => {});
}

/**
 * One source for every tab of the browser: the elected tab opens it, and what
 * it emits reaches each tab's `onMessage`, the leader's included.
 *
 * @param open Opens the source, handing it what relays a message; returns
 *   what closes it
 * @returns Leaves: closes the source when leading, and stops listening
 */
export function shareAcrossTabs(
  name: string,
  open: (emit: TabMessageHandler) => () => void,
  onMessage: TabMessageHandler,
  environment: CrossTabEnvironment = browserCrossTabEnvironment(),
): () => void {
  const bus = openTabBus(name, environment);
  const unlisten = bus.listen(onMessage);
  const resign = electLeader(name, environment, () => open(bus.post));
  return () => {
    resign();
    unlisten();
    bus.close();
  };
}
