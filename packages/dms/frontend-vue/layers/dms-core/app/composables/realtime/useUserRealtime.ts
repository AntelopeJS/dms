import {
  isUnauthorizedStreamError,
  openSseStream,
  type SseStreamHandle,
} from "./useSseStream";

const REALTIME_USER_PATH = "/api/realtime/user";
const REALTIME_SUBSCRIBE_PATH_PREFIX = "/api/realtime/subscribe/";
const REALTIME_UNSUBSCRIBE_PATH = "/api/realtime/unsubscribe";
const SESSION_HEADER = "x-realtime-session";
const SESSION_STATE_KEY = "dms.realtime.sessionId";
const MENU_TOPICS_STATE_KEY = "dms.realtime.menuTopics";
const HELLO_EVENT = "hello";
const SNAPSHOT_EVENT = "snapshot";
const RECONNECT_INITIAL_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MULTIPLIER = 2;

export interface RealtimeEvent {
  topic: string;
  type: string;
  payload?: Record<string, unknown>;
  actorId?: string;
  ts: number;
}

export interface RealtimeSnapshotEvent {
  topic: string;
  entries: Array<{
    topic: string;
    rowId: string;
    actor: { id: string; displayName?: string; avatarUrl?: string };
    sessionId: string;
    instanceId: string;
    since: number;
  }>;
}

export type RealtimeTopicHandler = (
  event: RealtimeEvent | RealtimeSnapshotEvent,
) => void;

export interface UserRealtimeApi {
  subscribe(topic: string, handler: RealtimeTopicHandler): () => void;
  setPage(pageId: string | null): Promise<void>;
  sessionId: Ref<string | undefined>;
  pageId: Ref<string | undefined>;
  /**
   * Menu-invalidation topics the server subscribed this session to. Their names
   * embed the tenant, which the client cannot derive on its own, so they are
   * announced in the greeting.
   */
  menuTopics: Ref<string[]>;
}

interface UserRealtimeState {
  sessionId: Ref<string | undefined>;
  pageId: Ref<string | undefined>;
  menuTopics: Ref<string[]>;
  appliedPageId: Ref<string | null>;
  handlers: Map<string, Set<RealtimeTopicHandler>>;
  snapshots: Map<string, RealtimeSnapshotEvent>;
  cancelConnect?: () => void;
}

let singletonApi: UserRealtimeApi | undefined;

const dispatchToHandlers = (
  state: UserRealtimeState,
  topic: string,
  event: RealtimeEvent | RealtimeSnapshotEvent,
): void => {
  const handlers = state.handlers.get(topic);
  if (!handlers) return;
  for (const handler of handlers) handler(event);
};

const isSnapshotEvent = (
  eventName: string,
  data: unknown,
): data is RealtimeSnapshotEvent =>
  eventName === SNAPSHOT_EVENT &&
  !!data &&
  typeof data === "object" &&
  "topic" in (data as Record<string, unknown>);

const isRealtimeEvent = (data: unknown): data is RealtimeEvent =>
  !!data &&
  typeof data === "object" &&
  typeof (data as Record<string, unknown>).topic === "string" &&
  typeof (data as Record<string, unknown>).type === "string";

const readMenuTopics = (data: object): string[] => {
  const { menuTopics } = data as { menuTopics?: unknown };
  if (!Array.isArray(menuTopics)) return [];
  return menuTopics.filter(
    (topic): topic is string => typeof topic === "string",
  );
};

const handleHello = (state: UserRealtimeState, data: unknown): void => {
  if (!data || typeof data !== "object" || !("sessionId" in data)) return;
  state.sessionId.value = String((data as { sessionId: unknown }).sessionId);
  state.menuTopics.value = readMenuTopics(data);
};

const handleEvent =
  (state: UserRealtimeState) =>
  (eventName: string, data: unknown): void => {
    if (eventName === HELLO_EVENT) {
      handleHello(state, data);
      return;
    }
    if (isSnapshotEvent(eventName, data)) {
      state.snapshots.set(data.topic, data);
      dispatchToHandlers(state, data.topic, data);
      return;
    }
    if (isRealtimeEvent(data)) {
      dispatchToHandlers(state, data.topic, data);
    }
  };

interface ConnectionCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  refreshSession: () => Promise<boolean>;
  redirectToAuth: () => Promise<void>;
}

interface Reconnector {
  isCancelled(): boolean;
  schedule(open: () => void): void;
  resetDelay(): void;
  cancel(): void;
}

const createReconnector = (): Reconnector => {
  let isCancelled = false;
  let delay = RECONNECT_INITIAL_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    isCancelled: () => isCancelled,
    schedule: (open) => {
      // A pending reconnect absorbs concurrent triggers: one stream per tab.
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

const recoverFromError = (
  error: unknown,
  reconnect: () => void,
  callbacks: ConnectionCallbacks,
): void => {
  if (!isUnauthorizedStreamError(error)) {
    reconnect();
    return;
  }
  void callbacks.refreshSession().then((isRefreshed) => {
    if (isRefreshed) {
      reconnect();
    } else {
      void callbacks.redirectToAuth();
    }
  }, reconnect);
};

/**
 * Keeps one user stream open until cancelled. The server ends the stream when
 * it stops (a dev reload included), so a clean EOF reconnects just like an
 * error does: the user stream has no business completion.
 */
const connectWithBackoff = (
  url: string,
  state: UserRealtimeState,
  callbacks: ConnectionCallbacks,
): (() => void) => {
  const reconnector = createReconnector();
  const dispatch = handleEvent(state);
  let activeHandle: SseStreamHandle | undefined;
  const open = () => {
    if (reconnector.isCancelled()) return;
    activeHandle?.close();
    const handle: SseStreamHandle = openSseStream({
      url,
      onEvent: (eventName, data) => {
        if (handle !== activeHandle) return;
        reconnector.resetDelay();
        dispatch(eventName, data);
        if (eventName === HELLO_EVENT) callbacks.onConnected();
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

const callPageEndpoint = async (
  state: UserRealtimeState,
  pageId: string | null,
  baseUrl: string,
): Promise<void> => {
  const sessionId = state.sessionId.value;
  if (!sessionId) return;
  const headers: Record<string, string> = { [SESSION_HEADER]: sessionId };
  const url = pageId
    ? `${baseUrl}${REALTIME_SUBSCRIBE_PATH_PREFIX}${pageId}`
    : `${baseUrl}${REALTIME_UNSUBSCRIBE_PATH}`;
  await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
  });
};

const reconcilePage = async (
  state: UserRealtimeState,
  baseUrl: string,
): Promise<void> => {
  const desired = state.pageId.value ?? null;
  const sessionId = state.sessionId.value;
  if (state.appliedPageId.value === desired) return;
  if (!sessionId) return;
  await callPageEndpoint(state, desired, baseUrl);
  // A reconnect during the call replaced the session: the page is applied to
  // the dead one, and the new one still needs it.
  if (state.sessionId.value !== sessionId) return;
  if ((state.pageId.value ?? null) === desired) {
    state.appliedPageId.value = desired;
  }
};

/**
 * Forgets what the server held for the closed session. The next greeting
 * brings a new session id, which re-applies the page topics here and lets the
 * components holding presence re-acquire it.
 */
const resetSession = (state: UserRealtimeState): void => {
  state.sessionId.value = undefined;
  state.appliedPageId.value = null;
  state.snapshots.clear();
};

const buildApi = (): UserRealtimeApi => {
  const sessionId = useDmsState<string | undefined>(
    SESSION_STATE_KEY,
    () => undefined,
  );
  const menuTopics = useDmsState<string[]>(MENU_TOPICS_STATE_KEY, () => []);
  const appliedPageId = ref<string | null>(null);
  const pageId = ref<string | undefined>(undefined);
  const state: UserRealtimeState = {
    sessionId,
    pageId,
    menuTopics,
    appliedPageId,
    handlers: new Map(),
    snapshots: new Map(),
  };

  const config = useDmsRuntimeConfig();
  const { loggedIn } = useUserSession();
  const { refreshSession, redirectToAuth } = useSessionRecovery();
  const baseUrl = config.public.dms.baseURL as string;

  if (!import.meta.env.SSR) {
    watch(
      () => loggedIn.value,
      (isLoggedIn) => {
        state.cancelConnect?.();
        state.cancelConnect = undefined;
        resetSession(state);
        state.menuTopics.value = [];
        if (!isLoggedIn) return;
        state.cancelConnect = connectWithBackoff(
          `${baseUrl}${REALTIME_USER_PATH}`,
          state,
          {
            onConnected: () => {
              void reconcilePage(state, baseUrl);
            },
            onDisconnected: () => resetSession(state),
            refreshSession,
            redirectToAuth,
          },
        );
      },
      { immediate: true },
    );
  }

  const subscribe = (topic: string, handler: RealtimeTopicHandler) => {
    let handlers = state.handlers.get(topic);
    if (!handlers) {
      handlers = new Set();
      state.handlers.set(topic, handlers);
    }
    handlers.add(handler);
    if (state.snapshots.has(topic)) {
      setTimeout(() => {
        if (!handlers?.has(handler)) return;
        const latest = state.snapshots.get(topic);
        if (latest) handler(latest);
      }, 0);
    }
    return () => {
      handlers?.delete(handler);
      if (handlers && handlers.size === 0) state.handlers.delete(topic);
    };
  };

  const setPage = async (next: string | null): Promise<void> => {
    state.pageId.value = next ?? undefined;
    if (import.meta.env.SSR) return;
    await reconcilePage(state, baseUrl);
  };

  return { subscribe, setPage, sessionId, pageId, menuTopics };
};

export function useUserRealtime(): UserRealtimeApi {
  if (!singletonApi) singletonApi = buildApi();
  return singletonApi;
}
