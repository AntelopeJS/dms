import {
  createReconnector,
  joinSharedRealtimeConnection,
  recoverFromError,
  type StreamRecovery,
} from "../../build/utils/sharedRealtimeConnection";
import { HTTP_UNAUTHORIZED } from "../../utils/http-status";

const REALTIME_CONNECTION_PATH = "/api/realtime/connection";
const REALTIME_SESSION_PATH = "/api/realtime/session";
const REALTIME_SESSION_CLOSE_PATH = "/api/realtime/session/close";
const REALTIME_SUBSCRIBE_PATH_PREFIX = "/api/realtime/subscribe/";
const REALTIME_UNSUBSCRIBE_PATH = "/api/realtime/unsubscribe";
const SESSION_HEADER = "x-realtime-session";
const CONNECTION_HEADER = "x-realtime-connection";
const CONNECTION_NAME_PREFIX = "dms-realtime";
const SESSION_STATE_KEY = "dms.realtime.sessionId";
const MENU_TOPICS_STATE_KEY = "dms.realtime.menuTopics";
const SNAPSHOT_EVENT = "snapshot";
/** The server ended this tab's session alone: the tab opens a new one. */
const SESSION_ENDED_EVENT = "session-ended";
/** Frames held while a session is being opened, every tab's included. */
const MAX_BUFFERED_FRAMES = 256;

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
  /**
   * The realtime topics of the page this session is on, as its subscription
   * answered them: an event on one means the page's data moved.
   */
  pageTopics: Ref<string[]>;
  /**
   * The topic the open connection carries the backend's development reload
   * signal under, as the session's greeting named it: the tab then needs no
   * reload stream of its own. Unset while no session is open, and in
   * production.
   */
  devReloadTopic: Ref<string | undefined>;
}

interface UserRealtimeState {
  sessionId: Ref<string | undefined>;
  pageId: Ref<string | undefined>;
  menuTopics: Ref<string[]>;
  pageTopics: Ref<string[]>;
  devReloadTopic: Ref<string | undefined>;
  appliedPageId: Ref<string | null>;
  handlers: Map<string, Set<RealtimeTopicHandler>>;
  snapshots: Map<string, RealtimeSnapshotEvent>;
  reconciling: Promise<void>;
  connection?: TabConnection;
}

/** This tab's hold on the shared connection. */
interface TabConnection {
  /** Opens a new session for the tab, in the browser session's workspace. */
  renewSession: () => void;
  cancel: () => void;
}

let singletonApi: UserRealtimeApi | undefined;

/** The user field the shared connection is keyed by. */
interface ConnectionUser {
  _id?: string;
}

/** The session fields a realtime session is bound to on the server. */
interface SessionScopeFields {
  accountId?: string;
  activeTenantId?: string;
}

/**
 * The account and workspace a realtime session is opened in. The server binds
 * a session to those of the request that opened it, so a switch of either
 * needs a new session: the old one would keep delivering the previous
 * workspace's events. The connection, keyed by user, stays.
 */
const sessionScopeOf = (
  session: SessionScopeFields | null | undefined,
): string =>
  JSON.stringify([session?.accountId ?? "", session?.activeTenantId ?? ""]);

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

/** Takes the session a greeting names, with the menu topics it announces. */
const handleHello = (state: UserRealtimeState, data: unknown): void => {
  if (!data || typeof data !== "object" || !("sessionId" in data)) return;
  state.sessionId.value = String((data as { sessionId: unknown }).sessionId);
  state.menuTopics.value = readMenuTopics(data);
  const { devReloadTopic } = data as { devReloadTopic?: unknown };
  state.devReloadTopic.value =
    typeof devReloadTopic === "string" ? devReloadTopic : undefined;
};

const handleEvent =
  (state: UserRealtimeState) =>
  (eventName: string, data: unknown): void => {
    if (isSnapshotEvent(eventName, data)) {
      state.snapshots.set(data.topic, data);
      dispatchToHandlers(state, data.topic, data);
      return;
    }
    if (isRealtimeEvent(data)) {
      dispatchToHandlers(state, data.topic, data);
    }
  };

interface ConnectionCallbacks extends StreamRecovery {
  onConnected: () => void;
  onDisconnected: () => void;
}

/** The answer of `POST /api/realtime/session`: a greeting, or `ok: false`. */
interface SessionGreeting {
  sessionId?: unknown;
  menuTopics?: unknown;
}

interface BufferedFrame {
  sessionId: string;
  eventName: string;
  data: unknown;
}

const readGreeting = async (
  response: Response,
): Promise<SessionGreeting | null> => {
  try {
    return (await response.json()) as SessionGreeting | null;
  } catch {
    return null;
  }
};

const unauthorizedError = (): Error =>
  Object.assign(new Error("Realtime session refused"), {
    status: HTTP_UNAUTHORIZED,
  });

/**
 * Keeps a session of this tab on the browser's shared realtime connection
 * until cancelled: a new one each time the connection changes, its leader tab
 * having gone or its stream having dropped, and each time it is renewed.
 */
const connectTab = (
  state: UserRealtimeState,
  baseUrl: string,
  userKey: string,
  callbacks: ConnectionCallbacks,
): TabConnection => {
  const dispatch = handleEvent(state);
  const retries = createReconnector();
  const sessionCloseUrl = `${baseUrl}${REALTIME_SESSION_CLOSE_PATH}`;
  let connectionId: string | undefined;

  let attempt = 0;

  let buffered: BufferedFrame[] | undefined;

  const closeStraySession = (forConnection: string, sessionId: string) => {
    void fetch(sessionCloseUrl, {
      method: "POST",
      headers: {
        [CONNECTION_HEADER]: forConnection,
        [SESSION_HEADER]: sessionId,
      },
      credentials: "include",
    }).catch(() => {});
  };

  const adopt = (forConnection: string, greeting: SessionGreeting) => {
    const sessionId = String(greeting.sessionId);
    handleHello(state, greeting);
    const pending = buffered ?? [];
    buffered = undefined;
    for (const frame of pending) {
      if (frame.sessionId === sessionId) dispatch(frame.eventName, frame.data);
    }
    retries.resetDelay();
    connection.announceSession(forConnection, sessionId);
    callbacks.onConnected();
  };

  const openSession = async (forConnection: string): Promise<void> => {
    const ownAttempt = ++attempt;
    const isCurrent = () =>
      !retries.isCancelled() &&
      connectionId === forConnection &&
      attempt === ownAttempt;
    const retry = () =>
      retries.schedule(() => {
        if (isCurrent()) void openSession(forConnection);
      });
    buffered = [];
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${REALTIME_SESSION_PATH}`, {
        method: "POST",

        headers: { [CONNECTION_HEADER]: forConnection },
        credentials: "include",
      });
    } catch (error) {
      if (isCurrent()) recoverFromError(error, retry, callbacks);
      return;
    }
    const greeting = response.ok ? await readGreeting(response) : null;
    const sessionId = greeting?.sessionId;
    if (!isCurrent()) {
      if (typeof sessionId === "string") {
        closeStraySession(forConnection, sessionId);
      }
      return;
    }
    if (response.status === HTTP_UNAUTHORIZED) {
      recoverFromError(unauthorizedError(), retry, callbacks);
      return;
    }
    if (!response.ok) {
      retry();
      return;
    }

    if (typeof sessionId !== "string") {
      buffered = undefined;
      retries.schedule(() => {
        if (isCurrent()) connection.reopen(forConnection);
      });
      return;
    }
    adopt(forConnection, greeting!);
  };

  const renewSession = () => {
    if (retries.isCancelled() || !connectionId) return;
    const sessionId = state.sessionId.value;
    if (sessionId) {
      closeStraySession(connectionId, sessionId);
      callbacks.onDisconnected();
    }
    void openSession(connectionId);
  };

  const connection = joinSharedRealtimeConnection({
    name: `${CONNECTION_NAME_PREFIX}:${baseUrl}:${userKey}`,
    streamUrl: `${baseUrl}${REALTIME_CONNECTION_PATH}`,
    sessionCloseUrl,
    onConnection: (next) => {
      if (retries.isCancelled()) return;
      if (state.sessionId.value) callbacks.onDisconnected();
      buffered = undefined;
      connectionId = next;
      if (next) void openSession(next);
    },
    onFrame: (sessionId, eventName, data) => {
      if (sessionId === undefined) {
        if (state.sessionId.value) dispatch(eventName, data);
        return;
      }
      if (sessionId === state.sessionId.value) {
        if (eventName === SESSION_ENDED_EVENT) {
          renewSession();
          return;
        }
        dispatch(eventName, data);
        return;
      }
      if (buffered && buffered.length < MAX_BUFFERED_FRAMES) {
        buffered.push({ sessionId, eventName, data });
      }
    },
    refreshSession: callbacks.refreshSession,
    redirectToAuth: callbacks.redirectToAuth,
  });

  return {
    renewSession,
    cancel: () => {
      retries.cancel();
      connection.leave();
    },
  };
};

interface PageSubscriptionAnswer {
  topics?: unknown;
}

/** The topics a page subscription answered, none when it answered none. */
const readPageTopics = async (response: Response): Promise<string[]> => {
  let answer: PageSubscriptionAnswer | null;
  try {
    answer = (await response.json()) as PageSubscriptionAnswer | null;
  } catch {
    return [];
  }
  const topics = answer?.topics;
  return Array.isArray(topics)
    ? topics.filter((topic): topic is string => typeof topic === "string")
    : [];
};

/** Subscribes the session to `pageId`, or to no page; returns its topics. */
const callPageEndpoint = async (
  state: UserRealtimeState,
  pageId: string | null,
  baseUrl: string,
): Promise<string[]> => {
  const sessionId = state.sessionId.value;
  if (!sessionId) return [];
  const headers: Record<string, string> = { [SESSION_HEADER]: sessionId };
  const url = pageId
    ? `${baseUrl}${REALTIME_SUBSCRIBE_PATH_PREFIX}${pageId}`
    : `${baseUrl}${REALTIME_UNSUBSCRIBE_PATH}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
  });
  return pageId && response.ok ? readPageTopics(response) : [];
};

const applyDesiredPage = async (
  state: UserRealtimeState,
  baseUrl: string,
): Promise<void> => {
  const desired = state.pageId.value ?? null;
  const sessionId = state.sessionId.value;
  if (state.appliedPageId.value === desired) return;
  if (!sessionId) return;
  const topics = await callPageEndpoint(state, desired, baseUrl);

  if (state.sessionId.value !== sessionId) return;
  state.appliedPageId.value = desired;
  state.pageTopics.value = topics;
};

/**
 * Runs one page call at a time. Two overlapping calls would each compare the
 * desired page with what the server held before either landed: an unsubscribe
 * in flight followed by a subscribe to the same page would skip the
 * subscribe, and the session would end up with no page at all.
 */
const reconcilePage = (
  state: UserRealtimeState,
  baseUrl: string,
): Promise<void> => {
  const run = state.reconciling
    .catch(() => undefined)
    .then(() => applyDesiredPage(state, baseUrl));
  state.reconciling = run;
  return run;
};

/**
 * Forgets what the server held for the closed session. The next greeting
 * brings a new session id, which re-applies the page topics here and lets the
 * components holding presence re-acquire it.
 */
const resetSession = (state: UserRealtimeState): void => {
  state.sessionId.value = undefined;
  state.appliedPageId.value = null;
  state.pageTopics.value = [];
  state.devReloadTopic.value = undefined;
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
  const pageTopics = ref<string[]>([]);
  const devReloadTopic = ref<string | undefined>(undefined);
  const state: UserRealtimeState = {
    sessionId,
    pageId,
    menuTopics,
    pageTopics,
    devReloadTopic,
    appliedPageId,
    handlers: new Map(),
    snapshots: new Map(),
    reconciling: Promise.resolve(),
  };

  const config = useDmsRuntimeConfig();
  const { loggedIn, user, session } = useDmsUserSession<
    ConnectionUser,
    SessionScopeFields
  >();
  const { refreshSession, redirectToAuth } = useSessionRecovery();
  const baseUrl = config.public.dms.baseURL as string;

  if (!import.meta.env.SSR) {
    watch(
      () => (loggedIn.value ? String(user.value?._id ?? "") : undefined),
      (userKey) => {
        state.connection?.cancel();
        state.connection = undefined;
        resetSession(state);
        state.menuTopics.value = [];
        if (userKey === undefined) return;
        state.connection = connectTab(state, baseUrl, userKey, {
          onConnected: () => {
            void reconcilePage(state, baseUrl);
          },
          onDisconnected: () => resetSession(state),
          refreshSession,
          redirectToAuth,
        });
      },
      { immediate: true },
    );

    watch(
      () => sessionScopeOf(session?.value),
      () => state.connection?.renewSession(),
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

  return {
    subscribe,
    setPage,
    sessionId,
    pageId,
    menuTopics,
    pageTopics,
    devReloadTopic,
  };
};

export function useUserRealtime(): UserRealtimeApi {
  if (!singletonApi) singletonApi = buildApi();
  return singletonApi;
}
