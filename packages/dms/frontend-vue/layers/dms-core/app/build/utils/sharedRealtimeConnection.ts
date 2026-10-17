import {
  isUnauthorizedStreamError,
  openSseStream,
  type SseStreamHandle,
} from "../../composables/realtime/useSseStream";
import {
  browserCrossTabEnvironment,
  type CrossTabEnvironment,
  electLeader,
  holdLock,
  openTabBus,
  type TabBus,
  tabLockName,
  whenReleased,
} from "./crossTab";

/**
 * The realtime connection one browser shares between its tabs: the elected tab
 * holds `GET /api/realtime/connection` and relays it, each tab opens its own
 * session on it. See `crossTab.ts` for why.
 *
 * @internal
 */

const HELLO_EVENT = "hello";
const SESSION_EVENT = "session";
const SESSION_HEADER = "x-realtime-session";
const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MULTIPLIER = 2;

interface ConnectionMessage {
  kind: "connection";
  /** `null` while the leader has no stream open. */
  connectionId: string | null;
}

interface FrameMessage {
  kind: "frame";
  connectionId: string;
  /** Unset on a frame of the connection itself, which every tab receives. */
  sessionId?: string;
  event: string;
  data: unknown;
}

/** A tab joining asks the leader for the connection it holds. */
interface QueryMessage {
  kind: "query";
}

/** A tab's session on the connection, for the leader to end once it goes. */
interface SessionMessage {
  kind: "session";
  connectionId: string;
  sessionId: string;
  tabId: string;
}

type HubMessage =
  | ConnectionMessage
  | FrameMessage
  | QueryMessage
  | SessionMessage;

export interface StreamRecovery {
  refreshSession: () => Promise<boolean>;
  redirectToAuth: () => Promise<void>;
}

export interface SharedRealtimeConnectionOptions extends StreamRecovery {
  /** Scopes the election and the relay: one connection per name. */
  name: string;
  streamUrl: string;
  sessionCloseUrl: string;
  /** The connection to open a session on; `undefined` while there is none. */
  onConnection: (connectionId: string | undefined) => void;
  /**
   * A frame of one tab's session, or of the connection itself (the dev
   * reload signal) when `sessionId` is unset.
   */
  onFrame: (
    sessionId: string | undefined,
    eventName: string,
    data: unknown,
  ) => void;
  environment?: CrossTabEnvironment;
}

export interface SharedRealtimeConnection {
  /** Hands this tab's session to the leader, which ends it once the tab goes. */
  announceSession: (connectionId: string, sessionId: string) => void;
  leave: () => void;
}

export interface Reconnector {
  isCancelled(): boolean;
  schedule(open: () => void): void;
  resetDelay(): void;
  cancel(): void;
}

export const createReconnector = (): Reconnector => {
  let isCancelled = false;
  let delay = RECONNECT_INITIAL_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    isCancelled: () => isCancelled,
    schedule: (open) => {
      // A pending reconnect absorbs concurrent triggers: one attempt at a time.
      if (isCancelled || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        open();
      }, delay);
      delay = Math.min(delay * RECONNECT_MULTIPLIER, RECONNECT_MAX_DELAY_MS);
    },
    resetDelay: () => {
      delay = RECONNECT_INITIAL_DELAY_MS;
    },
    cancel: () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
};

/** Retries after a failure, refreshing the browser session first on a 401. */
export const recoverFromError = (
  error: unknown,
  retry: () => void,
  recovery: StreamRecovery,
): void => {
  if (!isUnauthorizedStreamError(error)) {
    retry();
    return;
  }
  void recovery.refreshSession().then((isRefreshed) => {
    if (isRefreshed) {
      retry();
    } else {
      void recovery.redirectToAuth();
    }
  }, retry);
};

interface StreamCallbacks extends StreamRecovery {
  onEvent: (eventName: string, data: unknown) => void;
  onDisconnected: () => void;
}

/**
 * Keeps one stream open until cancelled. The server ends the stream when it
 * stops (a dev reload included), so a clean EOF reconnects just like an error
 * does: the stream has no business completion.
 */
const connectWithBackoff = (
  url: string,
  callbacks: StreamCallbacks,
): (() => void) => {
  const reconnector = createReconnector();
  let activeHandle: SseStreamHandle | undefined;
  const open = () => {
    if (reconnector.isCancelled()) return;
    activeHandle?.close();
    const handle: SseStreamHandle = openSseStream({
      url,
      onEvent: (eventName, data) => {
        if (handle !== activeHandle) return;
        reconnector.resetDelay();
        callbacks.onEvent(eventName, data);
      },
      onError: (error) => {
        if (!retire(handle)) return;
        recoverFromError(error, reconnect, callbacks);
      },
      onClose: (reason) => {
        if (reason !== "eof" || !retire(handle)) return;
        reconnect();
      },
    });
    activeHandle = handle;
  };
  const reconnect = () => reconnector.schedule(open);
  const retire = (handle: SseStreamHandle): boolean => {
    if (handle !== activeHandle || reconnector.isCancelled()) return false;
    activeHandle = undefined;
    callbacks.onDisconnected();
    return true;
  };
  open();
  return () => {
    reconnector.cancel();
    activeHandle?.close();
    activeHandle = undefined;
  };
};

const readConnectionId = (data: unknown): string | null => {
  const connectionId = (data as { connectionId?: unknown } | null)
    ?.connectionId;
  return typeof connectionId === "string" ? connectionId : null;
};

interface SessionFrame {
  sessionId?: unknown;
  event?: unknown;
  data?: unknown;
}

interface LeaderContext {
  options: SharedRealtimeConnectionOptions;
  environment: CrossTabEnvironment;
  bus: TabBus;
  tabId: string;
}

const closeSession = (url: string, sessionId: string): void => {
  void fetch(url, {
    method: "POST",
    headers: { [SESSION_HEADER]: sessionId },
    credentials: "include",
  }).catch(() => {});
};

/**
 * The elected tab's share: the stream, relayed on the bus, and the sessions
 * of the other tabs, each ended once its tab is gone.
 */
const lead = ({ options, environment, bus, tabId }: LeaderContext) => {
  const watchers = new AbortController();
  const sessionsByTab = new Map<string, Set<string>>();
  let connectionId: string | null = null;

  const publish = (next: string | null) => {
    connectionId = next;
    bus.post({ kind: "connection", connectionId: next });
  };

  const endSessionsOf = (otherTabId: string) => {
    const sessionIds = sessionsByTab.get(otherTabId) ?? new Set<string>();
    sessionsByTab.delete(otherTabId);
    for (const sessionId of sessionIds) {
      closeSession(options.sessionCloseUrl, sessionId);
    }
  };

  const watchSession = (message: SessionMessage) => {
    // This tab's own sessions end with the stream it holds.
    if (message.tabId === tabId || message.connectionId !== connectionId) {
      return;
    }
    const known = sessionsByTab.get(message.tabId);
    if (known) {
      known.add(message.sessionId);
      return;
    }
    sessionsByTab.set(message.tabId, new Set([message.sessionId]));
    whenReleased(
      tabLockName(options.name, message.tabId),
      environment,
      () => endSessionsOf(message.tabId),
      watchers.signal,
    );
  };

  const unlisten = bus.listen((raw) => {
    const message = raw as HubMessage;
    if (message.kind === "query")
      bus.post({ kind: "connection", connectionId });
    if (message.kind === "session") watchSession(message);
  });

  // The tabs may still hold the connection of a leader that went: they drop it.
  publish(null);
  const stopStream = connectWithBackoff(options.streamUrl, {
    onEvent: (eventName, data) => {
      if (eventName === HELLO_EVENT) {
        sessionsByTab.clear();
        publish(readConnectionId(data));
        return;
      }
      if (!connectionId) return;
      if (eventName !== SESSION_EVENT) {
        bus.post({ kind: "frame", connectionId, event: eventName, data });
        return;
      }
      const frame = data as SessionFrame | null;
      if (typeof frame?.sessionId !== "string") return;
      if (typeof frame.event !== "string") return;
      bus.post({
        kind: "frame",
        connectionId,
        sessionId: frame.sessionId,
        event: frame.event,
        data: frame.data,
      });
    },
    onDisconnected: () => publish(null),
    refreshSession: options.refreshSession,
    redirectToAuth: options.redirectToAuth,
  });

  return () => {
    watchers.abort();
    unlisten();
    stopStream();
    publish(null);
  };
};

const createTabId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Joins the browser's realtime connection for `options.name`, electing this
 * tab to hold it when no other tab does.
 */
export function joinSharedRealtimeConnection(
  options: SharedRealtimeConnectionOptions,
): SharedRealtimeConnection {
  const environment = options.environment ?? browserCrossTabEnvironment();
  const tabId = createTabId();
  const bus = openTabBus(options.name, environment);
  // Held before any session is announced: the leader waits on it to learn
  // that this tab went.
  const tabLock = holdLock(tabLockName(options.name, tabId), environment);
  let connectionId: string | undefined;

  const unlisten = bus.listen((raw) => {
    const message = raw as HubMessage;
    if (message.kind === "connection") {
      const next = message.connectionId ?? undefined;
      if (next === connectionId) return;
      connectionId = next;
      options.onConnection(next);
      return;
    }
    if (message.kind === "frame" && message.connectionId === connectionId) {
      options.onFrame(message.sessionId, message.event, message.data);
    }
  });

  const resign = electLeader(options.name, environment, () =>
    lead({ options, environment, bus, tabId }),
  );
  bus.post({ kind: "query" });

  return {
    announceSession: (sessionConnectionId, sessionId) => {
      void tabLock.held.then(() =>
        bus.post({
          kind: "session",
          connectionId: sessionConnectionId,
          sessionId,
          tabId,
        }),
      );
    },
    leave: () => {
      resign();
      unlisten();
      tabLock.release();
      bus.close();
    },
  };
}
