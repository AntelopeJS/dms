import type { User } from "@antelopejs/interface-dms/auth/db";
import type { Unsubscribe } from "./broker";

export type SessionSend = (eventName: string, data: unknown) => void;

export interface SessionInfo {
  user?: User;
  tenantId?: string;
  pageId?: string;
  send: SessionSend;
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
