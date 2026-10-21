import { randomUUID } from "node:crypto";
import {
  Context,
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { userCanAccessPage } from "../implementations/dms/page";
import {
  addDevReloadListener,
  DEV_RELOAD_TOPIC,
  isDevReloadEnabled,
} from "../implementations/dms/dev-reload";
import {
  buildMemberMenuTopic,
  buildMenuTopic,
  buildUserNotificationTopic,
  getPageTopics,
  getPresenceTracker,
  isEventForTenant,
  MENU_BROADCAST_TOPIC,
  openSseStream,
  type PresenceActor,
  subscribeRealtime,
} from "../realtime";
import {
  getConnectionInfo,
  getSessionInfo,
  getSessionSubscriptions,
  registerConnection,
  registerSession,
  type SessionInfo,
  setSessionPage,
  unregisterConnection,
  unregisterSession,
} from "../realtime/sessions";

const REALTIME_BASE = "/api/realtime";
const HELLO_EVENT = "hello";
const SNAPSHOT_EVENT = "snapshot";
/** A session's frame on a shared connection, enveloped with its session id. */
const SESSION_EVENT = "session";
/** Tells a tab its session on a shared connection was ended. */
const SESSION_ENDED_EVENT = "session-ended";
const SESSION_HEADER = "x-realtime-session";
/** The browser connection a tab opens its session on. */
const CONNECTION_HEADER = "x-realtime-connection";

type RealtimeAck = { ok: boolean };

/** A tab's session opened on its browser's connection. */
interface SessionGreeting extends RealtimeAck {
  sessionId?: string;
  menuTopics?: string[];
  /**
   * The topic the connection carries the backend's reload signal under,
   * outside production: the browser follows it rather than a reload stream
   * of its own.
   */
  devReloadTopic?: string;
}

/**
 * A page subscription's answer: the page's topics, whose events the browser
 * reads its page's data again on.
 */
interface PageSubscriptionAck extends RealtimeAck {
  topics: string[];
}

/** Who a page request was made as: the stream it names must be theirs. */
export interface RealtimeRequester {
  userId: string;
  tenantId: string;
}

interface PresenceRequestBody {
  pageId?: string;
  topic?: string;
  key?: string;
}

const buildActor = (user: User): PresenceActor => ({
  id: user._id,
  displayName: user.name || user.email,
});

const isValidPresenceBody = (
  body: unknown,
): body is { pageId: string; topic: string; key: string } => {
  if (!body || typeof body !== "object") return false;
  const candidate = body as PresenceRequestBody;
  return (
    typeof candidate.pageId === "string" &&
    typeof candidate.topic === "string" &&
    typeof candidate.key === "string"
  );
};

// Menu invalidations: the session's own tenant, its user's access in that
// tenant, plus the broadcast topic a NotifyMenuChanged() call that names no
// tenant lands on. The session subscribes to these and the greeting announces
// them, so both must read the same list.
export const menuTopicsFor = (
  tenantId: string | undefined,
  userId: string | undefined,
): string[] => {
  if (!tenantId) return [MENU_BROADCAST_TOPIC];
  const topics = [MENU_BROADCAST_TOPIC, buildMenuTopic(tenantId)];
  if (userId) topics.push(buildMemberMenuTopic(tenantId, userId));
  return topics;
};

const computeDesiredTopics = (sessionId: string): Set<string> => {
  const info = getSessionInfo(sessionId);
  const topics = new Set<string>();
  if (!info) return topics;
  if (info.user) topics.add(buildUserNotificationTopic(info.user._id));
  for (const topic of menuTopicsFor(info.tenantId, info.user?._id))
    topics.add(topic);
  if (info.pageId) {
    for (const topic of getPageTopics(info.pageId)) topics.add(topic);
  }
  return topics;
};

const applySessionTopics = async (
  sessionId: string,
  refreshSnapshots = false,
): Promise<void> => {
  const info = getSessionInfo(sessionId);
  const subscriptions = getSessionSubscriptions(sessionId);
  if (!info || !subscriptions) return;
  const desired = computeDesiredTopics(sessionId);
  for (const [topic, unsubscribe] of subscriptions) {
    if (desired.has(topic)) continue;
    unsubscribe();
    subscriptions.delete(topic);
  }
  const presence = getPresenceTracker();
  for (const topic of desired) {
    const isNew = !subscriptions.has(topic);
    if (isNew) {
      // Tracked rather than bound to the broker of the moment: a live SSE
      // session must keep receiving across a realtime reconfiguration. An
      // event another tenant published is not this session's to receive.
      subscriptions.set(
        topic,
        subscribeRealtime(topic, (event) => {
          if (!isEventForTenant(event, info.tenantId)) return;
          info.send(event.topic, event);
        }),
      );
    }
    if (isNew || refreshSnapshots) {
      const entries = await presence.snapshotForTopic(topic, info.tenantId);
      info.send(SNAPSHOT_EVENT, { topic, entries });
    }
  }
};

const cleanupSession = async (sessionId: string): Promise<void> => {
  const subscriptions = unregisterSession(sessionId);
  for (const unsubscribe of subscriptions.values()) unsubscribe();
  await getPresenceTracker().releaseAllForSession(sessionId);
};

const warnUnlessClosed = (sessionId: string) => (error: unknown) => {
  if (!getSessionInfo(sessionId)) return;
  Logging.Warn("Realtime: applySessionTopics failed", error);
};

const isSessionOf = (
  info: SessionInfo,
  requester: RealtimeRequester,
): boolean =>
  info.user?._id === requester.userId && info.tenantId === requester.tenantId;

/**
 * Ends one session alone: the other tabs' sessions riding on its connection
 * stay, and its tab is told so, to open a new one.
 */
const endSession = async (
  sessionId: string,
  info: SessionInfo,
): Promise<void> => {
  info.send(SESSION_ENDED_EVENT, { sessionId });
  await cleanupSession(sessionId);
};

/**
 * Puts the session on `pageId`, once it is known to be the requester's own.
 *
 * A session keeps the user and tenant it was opened with, while the browser
 * may have switched workspace (or account) since, in this tab or another: its
 * page requests then carry the new identity. Subscribing the old session would
 * deliver the previous workspace's events to the new one's page, so the
 * session is ended instead, and the client opens one in the current workspace.
 */
export const ensureSessionOnPage = async (
  sessionId: string,
  pageId: string,
  requester: RealtimeRequester,
): Promise<boolean> => {
  const info = getSessionInfo(sessionId);
  if (!info) return false;
  if (!isSessionOf(info, requester)) {
    await endSession(sessionId, info);
    return false;
  }
  if (info.pageId === pageId) return true;
  if (info.pageId) {
    await getPresenceTracker().releaseAllForSession(sessionId);
  }
  setSessionPage(sessionId, pageId);
  await applySessionTopics(sessionId, true);
  return true;
};

export class RealtimeController extends Controller(REALTIME_BASE) {
  /**
   * One stream per browser, shared by its tabs: a tab opens its session on it
   * with `POST /session`, and the stream carries each session's frames inside
   * a `session` event that names it. Ending the stream ends its sessions.
   */
  @Get("/connection")
  async connectionStream(
    @Context() ctx: RequestContext,
    @AuthRawUser() user: User,
  ): Promise<void> {
    const connectionId = randomUUID();
    const stream = openSseStream(ctx);
    registerConnection(connectionId, {
      userId: user._id,
      send: stream.send,
      close: stream.close,
    });
    stream.send(HELLO_EVENT, { connectionId, ts: Date.now() });
    // Once per connection, outside any session: every tab of the browser
    // hears it from the one stream.
    const stopDevReload = addDevReloadListener((type) =>
      stream.send(DEV_RELOAD_TOPIC, {
        topic: DEV_RELOAD_TOPIC,
        type,
        ts: Date.now(),
      }),
    );
    stream.onClose(async () => {
      stopDevReload();
      const sessionIds = unregisterConnection(connectionId);
      await Promise.all(
        sessionIds.map((sessionId) =>
          cleanupSession(sessionId).catch((error) =>
            Logging.Warn("Realtime: cleanupSession failed", error),
          ),
        ),
      );
    });
  }

  /**
   * Opens a tab's session on a shared connection. The session takes this
   * request's tenant, so tabs on different workspaces share one connection.
   * Its frames may reach the browser before this answer does. The connection
   * comes in the `x-realtime-connection` header, which the dashboard's proxy
   * relays with every `x-realtime-*` header.
   */
  @Post("/session")
  async openSession(
    @Context() ctx: RequestContext,
    @Parameter(CONNECTION_HEADER, "header") connectionId: string | undefined,
    @AuthRawUser() user: User,
  ): Promise<SessionGreeting> {
    const connection = connectionId
      ? getConnectionInfo(connectionId)
      : undefined;
    if (!connectionId || !connection) return { ok: false };
    // The connection id is the browser's: another user's request holding it
    // must not read that user's events.
    assert(connection.userId === user._id, 403, "error.forbidden");
    const sessionId = randomUUID();
    const tenantId = getRequestTenantId(ctx);
    registerSession(sessionId, {
      user,
      tenantId,
      connectionId,
      send: (eventName, data) =>
        connection.send(SESSION_EVENT, { sessionId, event: eventName, data }),
    });
    void applySessionTopics(sessionId).catch(warnUnlessClosed(sessionId));
    return {
      ok: true,
      sessionId,
      menuTopics: menuTopicsFor(tenantId, user._id),
      devReloadTopic: isDevReloadEnabled() ? DEV_RELOAD_TOPIC : undefined,
    };
  }

  /**
   * Ends a session of a shared connection: its tab is gone, or opened another.
   * The connection and the other sessions on it stay open. Like
   * `POST /session`, it names the connection in `x-realtime-connection`: only
   * a session on that connection is ended.
   */
  @Post("/session/close")
  async closeSession(
    @Parameter(CONNECTION_HEADER, "header") connectionId: string | undefined,
    @Parameter(SESSION_HEADER, "header") sessionId: string | undefined,
    @AuthRawUser() user: User,
  ): Promise<RealtimeAck> {
    const info = sessionId ? getSessionInfo(sessionId) : undefined;
    if (!sessionId || !info || info.user?._id !== user._id)
      return { ok: false };
    if (!connectionId || info.connectionId !== connectionId) {
      return { ok: false };
    }
    await cleanupSession(sessionId);
    return { ok: true };
  }

  @Post("/subscribe/:pageId")
  // Each parameter is bound to a request input by its decorator, so
  // the framework hands them in positionally: an options object is not
  // expressible here.
  // oxlint-disable-next-line eslint/max-params
  async subscribePage(
    @Context() ctx: RequestContext,
    @Parameter("pageId", "param") pageId: string,
    @Parameter(SESSION_HEADER, "header") sessionId: string,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @AuthRawUser() user: User,
  ): Promise<PageSubscriptionAck> {
    if (!sessionId || !getSessionInfo(sessionId)) {
      return { ok: false, topics: [] };
    }
    const tenantId = getRequestTenantId(ctx);
    const canAccess = await userCanAccessPage(
      user,
      pageId,
      memberModel,
      roleModel,
      tenantId,
    );
    assert(canAccess, 403, "error.forbidden");
    if (
      !(await ensureSessionOnPage(sessionId, pageId, {
        userId: user._id,
        tenantId,
      }))
    ) {
      return { ok: false, topics: [] };
    }
    return { ok: true, topics: [...getPageTopics(pageId)] };
  }

  @Post("/unsubscribe")
  async unsubscribePage(
    @Parameter(SESSION_HEADER, "header") sessionId: string,
  ): Promise<RealtimeAck> {
    const info = getSessionInfo(sessionId);
    if (!sessionId || !info) return { ok: false };
    if (info.pageId) {
      await getPresenceTracker().releaseAllForSession(sessionId);
    }
    setSessionPage(sessionId, undefined);
    await applySessionTopics(sessionId);
    return { ok: true };
  }

  @Post("/acquire")
  // Each parameter is bound to a request input by its decorator, so
  // the framework hands them in positionally: an options object is not
  // expressible here.
  // oxlint-disable-next-line eslint/max-params
  async acquire(
    @Context() ctx: RequestContext,
    @JSONBody() body: unknown,
    @Parameter(SESSION_HEADER, "header") sessionId: string,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @AuthRawUser() user: User,
  ): Promise<RealtimeAck> {
    if (!sessionId || !isValidPresenceBody(body)) return { ok: false };
    if (!getPageTopics(body.pageId).has(body.topic)) return { ok: false };
    const tenantId = getRequestTenantId(ctx);
    const canAccess = await userCanAccessPage(
      user,
      body.pageId,
      memberModel,
      roleModel,
      tenantId,
    );
    if (!canAccess) return { ok: false };
    if (
      !(await ensureSessionOnPage(sessionId, body.pageId, {
        userId: user._id,
        tenantId,
      }))
    ) {
      return { ok: false };
    }
    await getPresenceTracker().acquire(sessionId, body.topic, body.key, {
      actor: buildActor(user),
      tenantId,
    });
    return { ok: true };
  }

  @Post("/release")
  // Each parameter is bound to a request input by its decorator, so
  // the framework hands them in positionally: an options object is not
  // expressible here.
  // oxlint-disable-next-line eslint/max-params
  async release(
    @Context() ctx: RequestContext,
    @JSONBody() body: unknown,
    @Parameter(SESSION_HEADER, "header") sessionId: string,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @AuthRawUser() user: User,
  ): Promise<RealtimeAck> {
    if (!sessionId || !isValidPresenceBody(body)) return { ok: false };
    if (!getPageTopics(body.pageId).has(body.topic)) return { ok: false };
    const canAccess = await userCanAccessPage(
      user,
      body.pageId,
      memberModel,
      roleModel,
      getRequestTenantId(ctx),
    );
    if (!canAccess) return { ok: false };
    await getPresenceTracker().release(
      sessionId,
      body.topic,
      body.key,
      user._id,
    );
    return { ok: true };
  }
}
