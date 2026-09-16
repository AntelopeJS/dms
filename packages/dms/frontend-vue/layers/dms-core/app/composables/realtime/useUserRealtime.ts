import { isUnauthorizedStreamError, openSseStream } from "./useSseStream";

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

const connectWithBackoff = (
  url: string,
  state: UserRealtimeState,
  onConnected: () => void,
  refreshSession: () => Promise<boolean>,
  redirectToAuth: () => Promise<void>,
): (() => void) => {
  let cancelled = false;
  let delay = RECONNECT_INITIAL_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeHandle: { close(): void } | undefined;
  const dispatch = handleEvent(state);
  const open = () => {
    if (cancelled) return;
    activeHandle = openSseStream({
      url,
      onEvent: (eventName, data) => {
        if (cancelled) return;
        delay = RECONNECT_INITIAL_DELAY_MS;
        dispatch(eventName, data);
        if (eventName === HELLO_EVENT) onConnected();
      },
      onError: (error) => {
        if (cancelled) return;
        state.appliedPageId.value = null;
        const scheduleReconnect = () => {
          if (cancelled) return;
          timer = setTimeout(open, delay);
          delay = Math.min(
            delay * RECONNECT_MULTIPLIER,
            RECONNECT_MAX_DELAY_MS,
          );
        };
        if (isUnauthorizedStreamError(error)) {
          void refreshSession().then((refreshed) => {
            if (refreshed) {
              scheduleReconnect();
            } else {
              void redirectToAuth();
            }
          }, scheduleReconnect);
          return;
        }
        scheduleReconnect();
      },
    });
  };
  open();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
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
  if (state.appliedPageId.value === desired) return;
  if (!state.sessionId.value) return;
  await callPageEndpoint(state, desired, baseUrl);
  if ((state.pageId.value ?? null) === desired) {
    state.appliedPageId.value = desired;
  }
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
        state.sessionId.value = undefined;
        state.menuTopics.value = [];
        state.appliedPageId.value = null;
        state.snapshots.clear();
        if (!isLoggedIn) return;
        state.cancelConnect = connectWithBackoff(
          `${baseUrl}${REALTIME_USER_PATH}`,
          state,
          () => {
            void reconcilePage(state, baseUrl);
          },
          refreshSession,
          redirectToAuth,
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
