import type { User } from "@antelopejs/interface-dms/auth/db";
import type { Unsubscribe } from "./broker";

export type SessionSend = (eventName: string, data: unknown) => void;
export type SessionClose = () => Promise<void>;

export interface SessionInfo {
  user?: User;
  tenantId?: string;
  pageId?: string;
  send: SessionSend;
  /** Ends the session's stream; its close handlers unregister the session. */
  close: SessionClose;
}

interface SessionState {
  info: SessionInfo;
  subscriptions: Map<string, Unsubscribe>;
}

const sessions = new Map<string, SessionState>();

export function registerSession(sessionId: string, info: SessionInfo): void {
  sessions.set(sessionId, { info, subscriptions: new Map() });
}

export function unregisterSession(sessionId: string): Map<string, Unsubscribe> {
  const state = sessions.get(sessionId);
  sessions.delete(sessionId);
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

/**
 * Ends every open session stream. A stream left open across a stop stays bound
 * to a broker that no longer delivers anything: the client keeps receiving
 * keepalives but never another event, and has no reason to reconnect.
 */
export async function closeAllSessions(): Promise<void> {
  const open = [...sessions.values()];
  await Promise.allSettled(open.map((state) => state.info.close()));
}
