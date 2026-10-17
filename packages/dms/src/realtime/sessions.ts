import type { User } from "@antelopejs/interface-dms/auth/db";
import type { Unsubscribe } from "./broker";

export type SessionSend = (eventName: string, data: unknown) => void;
export type SessionClose = () => Promise<void>;

export interface SessionInfo {
  user?: User;
  tenantId?: string;
  pageId?: string;
  /** The shared connection the session rides on; unset on a stream of its own. */
  connectionId?: string;
  send: SessionSend;
  /** Ends the session's stream; its close handlers unregister the session. */
  close: SessionClose;
}

/**
 * One browser's stream, shared by the sessions of its tabs: a session per tab
 * keeps its own page, topics and presence, and only the transport is shared.
 */
export interface ConnectionInfo {
  userId: string;
  send: SessionSend;
  /** Ends the stream; its close handlers end the sessions riding on it. */
  close: SessionClose;
}

interface SessionState {
  info: SessionInfo;
  subscriptions: Map<string, Unsubscribe>;
}

interface ConnectionState {
  info: ConnectionInfo;
  sessionIds: Set<string>;
}

const sessions = new Map<string, SessionState>();
const connections = new Map<string, ConnectionState>();

export function registerSession(sessionId: string, info: SessionInfo): void {
  sessions.set(sessionId, { info, subscriptions: new Map() });
  if (info.connectionId) {
    connections.get(info.connectionId)?.sessionIds.add(sessionId);
  }
}

export function unregisterSession(sessionId: string): Map<string, Unsubscribe> {
  const state = sessions.get(sessionId);
  sessions.delete(sessionId);
  const connectionId = state?.info.connectionId;
  if (connectionId) connections.get(connectionId)?.sessionIds.delete(sessionId);
  return state?.subscriptions ?? new Map();
}

export function getSessionInfo(sessionId: string): SessionInfo | undefined {
  return sessions.get(sessionId)?.info;
}

export function setSessionPage(
  sessionId: string,
  pageId: string | undefined,
): boolean {
  const state = sessions.get(sessionId);
  if (!state) return false;
  state.info.pageId = pageId;
  return true;
}

export function getSessionSubscriptions(
  sessionId: string,
): Map<string, Unsubscribe> | undefined {
  return sessions.get(sessionId)?.subscriptions;
}

export function registerConnection(
  connectionId: string,
  info: ConnectionInfo,
): void {
  connections.set(connectionId, { info, sessionIds: new Set() });
}

/** Forgets the connection and returns the sessions still riding on it. */
export function unregisterConnection(connectionId: string): string[] {
  const state = connections.get(connectionId);
  connections.delete(connectionId);
  return state ? [...state.sessionIds] : [];
}

export function getConnectionInfo(
  connectionId: string,
): ConnectionInfo | undefined {
  return connections.get(connectionId)?.info;
}

/**
 * Ends every open stream, shared connections included. A stream left open
 * across a stop stays bound to a broker that no longer delivers anything: the
 * client keeps receiving keepalives but never another event, and has no reason
 * to reconnect.
 */
export async function closeAllSessions(): Promise<void> {
  const ownStreams = [...sessions.values()].filter(
    (state) => !state.info.connectionId,
  );
  await Promise.allSettled([
    ...ownStreams.map((state) => state.info.close()),
    ...[...connections.values()].map((state) => state.info.close()),
  ]);
}
