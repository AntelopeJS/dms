import { vi } from "vitest";

/**
 * The backend's realtime routes as the browser sees them: shared connections
 * (`GET /api/realtime/connection`), a session per tab on one, and the page
 * calls each session makes.
 */

export const BASE_URL = "http://api";
const CONNECTION_URL = `${BASE_URL}/api/realtime/connection`;
const SESSION_URL = `${BASE_URL}/api/realtime/session`;
const SESSION_CLOSE_URL = `${BASE_URL}/api/realtime/session/close`;
const SUBSCRIBE_URL_PREFIX = `${BASE_URL}/api/realtime/subscribe/`;
const UNSUBSCRIBE_URL = `${BASE_URL}/api/realtime/unsubscribe`;
const SESSION_HEADER = "x-realtime-session";
const CONNECTION_HEADER = "x-realtime-connection";
/**
 * The request headers the DMS renderer's backend proxy relays
 * (@antelopejs/dms-frontend, `CLIENT_HEADERS` in
 * `templates/vue/server/auth/backend.mjs`, plus the request's own): any other
 * header the browser sends never reaches the backend.
 */
const RELAYED_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "content-type",
  "if-match",
  "origin",
  "referer",
  "user-agent",
  "x-content-language",
  "x-realtime-session",
  "x-realtime-connection",
]);
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

const encoder = new TextEncoder();

export interface FakeConnection {
  id: string;
  signal: AbortSignal;
  isOpen(): boolean;
  write<Data>(eventName: string, data: Data): void;
  end(): void;
}

export interface FakeSession {
  id: string;
  connectionId: string;
}

export interface PageCall {
  sessionId: string;
  pageId: string | null;
}

export interface FakeRealtimeServer {
  connections: FakeConnection[];
  sessions: FakeSession[];
  closedSessions: string[];
  pageCalls: PageCall[];
  /** The most connections open at once. */
  maxOpenConnections: number;
  /** Refuses the stream as a server that is down. */
  isDown: boolean;
  /** The topic the session greeting says the dev reload signal comes under. */
  devReloadTopic?: string;
  /** Answers each session request with this status instead, while set. */
  sessionStatus?: number;
  /**
   * Answers this many next session requests `ok: false`, as an instance that
   * does not hold the connection named.
   */
  unknownConnectionAnswers: number;
  /** Runs once a session exists, before its answer leaves. */
  beforeSessionAnswer?: (session: FakeSession) => void;
  openConnections(): FakeConnection[];
  lastConnection(): FakeConnection;
  /** Sends a frame to one session, through the connection it rides on. */
  send<Data>(sessionId: string, eventName: string, data: Data): void;
  /** Stream requests the browser made, refused ones included. */
  streamAttempts: number;
  /** Request headers the renderer's proxy would have dropped. */
  droppedHeaders: string[];
}

interface JsonAnswer<Body> {
  ok: boolean;
  status: number;
  json: () => Promise<Body>;
}

const json = <Body>(body: Body, status = HTTP_OK): JsonAnswer<Body> => ({
  ok: status >= HTTP_OK && status < 300,
  status,
  json: async () => body,
});

const openConnection = (server: FakeRealtimeServer, signal: AbortSignal) => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let isOpen = true;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
    cancel() {
      isOpen = false;
    },
  });
  signal.addEventListener("abort", () => {
    isOpen = false;
  });
  const connection: FakeConnection = {
    id: `connection-${server.connections.length + 1}`,
    signal,
    isOpen: () => isOpen && !signal.aborted,
    write: (eventName, data) => {
      if (!connection.isOpen()) return;
      controller.enqueue(
        encoder.encode(
          `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
        ),
      );
    },
    end: () => {
      isOpen = false;
      controller.close();
    },
  };
  server.connections.push(connection);
  server.maxOpenConnections = Math.max(
    server.maxOpenConnections,
    server.openConnections().length,
  );
  connection.write("hello", { connectionId: connection.id, ts: 0 });
  return { ok: true, status: HTTP_OK, body };
};

const openSession = (server: FakeRealtimeServer, connectionId: string) => {
  if (server.sessionStatus) return json({}, server.sessionStatus);
  if (server.unknownConnectionAnswers > 0) {
    server.unknownConnectionAnswers -= 1;
    return json({ ok: false });
  }
  const connection = server.connections.find(
    (candidate) => candidate.id === connectionId,
  );
  if (!connection?.isOpen()) return json({ ok: false });
  const session = {
    id: `session-${server.sessions.length + 1}`,
    connectionId,
  };
  server.sessions.push(session);
  server.beforeSessionAnswer?.(session);
  return json({
    ok: true,
    sessionId: session.id,
    menuTopics: [],
    devReloadTopic: server.devReloadTopic,
  });
};

const recordPageCall = (
  server: FakeRealtimeServer,
  url: string,
  sessionId: string,
) => {
  const pageId =
    url === UNSUBSCRIBE_URL ? null : url.slice(SUBSCRIBE_URL_PREFIX.length);
  server.pageCalls.push({ sessionId, pageId });
  return json({ ok: true, topics: pageId ? [`table:${pageId}`] : [] });
};

export function createRealtimeServer(): FakeRealtimeServer {
  const server: FakeRealtimeServer = {
    connections: [],
    sessions: [],
    closedSessions: [],
    pageCalls: [],
    maxOpenConnections: 0,
    isDown: false,
    unknownConnectionAnswers: 0,
    openConnections: () =>
      server.connections.filter((connection) => connection.isOpen()),
    lastConnection: () => server.connections[server.connections.length - 1]!,
    send: (sessionId, eventName, data) => {
      const session = server.sessions.find(
        (candidate) => candidate.id === sessionId,
      );
      const connection = server.connections.find(
        (candidate) => candidate.id === session?.connectionId,
      );
      connection?.write("session", { sessionId, event: eventName, data });
    },
    streamAttempts: 0,
    droppedHeaders: [],
  };
  return server;
}

/**
 * The request's headers as the backend gets them through the renderer's
 * proxy: the ones it does not relay are dropped, and noted on `server`.
 */
const relayHeaders = (
  server: FakeRealtimeServer,
  init: RequestInit | undefined,
) => {
  const relayed: Record<string, string> = {};
  for (const [name, value] of Object.entries(init?.headers ?? {})) {
    const key = name.toLowerCase();
    if (RELAYED_HEADERS.has(key)) relayed[key] = value;
    else server.droppedHeaders.push(name);
  }
  return relayed;
};

/**
 * Answers the browser's realtime requests from `server`, behind the
 * renderer's backend proxy.
 */
export function installRealtimeFetch(server: FakeRealtimeServer): void {
  // oxlint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions -- This fetch double exposes only the response members realtime code consumes. Inference cannot assign partial responses to fetch and the Response owner requires unrelated browser methods; the boundary remains intentionally incomplete.
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const headers = relayHeaders(server, init);
    if (url === CONNECTION_URL) {
      server.streamAttempts += 1;
      if (server.isDown) throw new Error("connection refused");
      return openConnection(server, init!.signal!);
    }
    if (url === SESSION_URL) {
      return openSession(server, headers[CONNECTION_HEADER] ?? "");
    }
    if (url === SESSION_CLOSE_URL) {
      const sessionId = headers[SESSION_HEADER];
      const session = server.sessions.find(
        (candidate) => candidate.id === sessionId,
      );

      if (!session || session.connectionId !== headers[CONNECTION_HEADER]) {
        return json({ ok: false });
      }
      server.closedSessions.push(session.id);
      return json({ ok: true });
    }
    if (url.startsWith(SUBSCRIBE_URL_PREFIX) || url === UNSUBSCRIBE_URL) {
      return recordPageCall(server, url, headers[SESSION_HEADER]!);
    }
    return json({}, HTTP_NOT_FOUND);
  }) as unknown as typeof fetch;
  // oxlint-enable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions
}
