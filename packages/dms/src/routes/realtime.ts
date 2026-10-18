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
  setSessionPage,
  unregisterConnection,
  unregisterSession,
} from "../realtime/sessions";

const REALTIME_BASE = "/api/realtime";
const HELLO_EVENT = "hello";
const SNAPSHOT_EVENT = "snapshot";
/** A session's frame on a shared connection, enveloped with its session id. */
const SESSION_EVENT = "session";
const SESSION_HEADER = "x-realtime-session";

type RealtimeAck = { ok: boolean };

/**
 * A session opened on a shared connection: what the greeting of a stream of
 * its own carries.
 */
interface SessionGreeting extends RealtimeAck {
  sessionId?: string;
  menuTopics?: string[];
  /** The connection carries the dev reload signal (topic `dms:dev-reload`). */
  devReload?: true;
}

/**
 * A page subscription's answer: the page's topics, whose events the browser
 * reads its page's data again on.
 */
interface PageSubscriptionAck extends RealtimeAck {
  topics: string[];
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

/** The connection id of a `POST /session` body, or none. */
const readConnectionId = (body: unknown): string | undefined => {
  if (!body || typeof body !== "object") return undefined;
  const { connectionId } = body as { connectionId?: unknown };
  return typeof connectionId === "string" ? connectionId : undefined;
};

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
      // session must keep receiving across a realtime reconfiguration.
      subscriptions.set(
        topic,
        subscribeRealtime(topic, (event) => info.send(event.topic, event)),
      );
    }
    if (isNew || refreshSnapshots) {
      const entries = await presence.snapshotForTopic(topic);
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

const ensureSessionOnPage = async (
  sessionId: string,
  pageId: string,
): Promise<boolean> => {
  const info = getSessionInfo(sessionId);
  if (!info) return false;
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
   * A stream of one session, the transport of a client that cannot share a
   * connection between its tabs. Each one holds an HTTP/1.1 connection of the
   * browser's six per host for as long as it lives.
   */
  @Get("/user")
  async userStream(
    @Context() ctx: RequestContext,
    @AuthRawUser() user: User,
  ): Promise<void> {
    const sessionId = randomUUID();
    const tenantId = getRequestTenantId(ctx);
    const stream = openSseStream(ctx);
    registerSession(sessionId, {
      user,
      tenantId,
      send: stream.send,
      close: stream.close,
    });
    // The menu topics travel with the greeting: the client cannot derive its
    // tenant's topic name on its own, and dispatch is keyed by topic.
    // Outside production the stream also carries the reload signal (topic
    // `dms:dev-reload`), so a tab holds one stream to the backend, not two:
    // browsers allow six HTTP/1.1 connections per host.
    stream.send(HELLO_EVENT, {
      sessionId,
      ts: Date.now(),
      menuTopics: menuTopicsFor(tenantId, user._id),
      devReload: isDevReloadEnabled() || undefined,
    });
    const stopDevReload = addDevReloadListener((type) =>
      stream.send(DEV_RELOAD_TOPIC, {
        topic: DEV_RELOAD_TOPIC,
        type,
        ts: Date.now(),
      }),
    );
    let isClosed = false;
    // Awaited so that stopRealtime() releases presence before the broker
    // closes.
    stream.onClose(async () => {
      isClosed = true;
      stopDevReload();
      await cleanupSession(sessionId).catch((error) =>
        Logging.Warn("Realtime: cleanupSession failed", error),
      );
    });
    void applySessionTopics(sessionId).catch((error) => {
      if (isClosed) return;
      Logging.Warn("Realtime: applySessionTopics failed", error);
    });
  }

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
   * id comes in the body, `{ connectionId }`: a proxy in front of the DMS
   * relays it, where it may drop a header it does not know.
   */
  @Post("/session")
  async openSession(
    @Context() ctx: RequestContext,
    @JSONBody() body: unknown,
    @AuthRawUser() user: User,
  ): Promise<SessionGreeting> {
    const connectionId = readConnectionId(body);
    const connection = connectionId
      ? getConnectionInfo(connectionId)
      : undefined;
    if (!connection) return { ok: false };
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
      close: connection.close,
    });
    void applySessionTopics(sessionId).catch(warnUnlessClosed(sessionId));
    return {
      ok: true,
      sessionId,
      menuTopics: menuTopicsFor(tenantId, user._id),
      devReload: isDevReloadEnabled() || undefined,
    };
  }

  /**
   * Ends a session of a shared connection: its tab is gone, or opened another.
   * The connection and the other sessions on it stay open.
   */
  @Post("/session/close")
  async closeSession(
    @Parameter(SESSION_HEADER, "header") sessionId: string,
    @AuthRawUser() user: User,
  ): Promise<RealtimeAck> {
    const info = sessionId ? getSessionInfo(sessionId) : undefined;
    if (!info?.connectionId || info.user?._id !== user._id)
      return { ok: false };
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
    const canAccess = await userCanAccessPage(
      user,
      pageId,
      memberModel,
      roleModel,
      getRequestTenantId(ctx),
    );
    assert(canAccess, 403, "error.forbidden");
    await ensureSessionOnPage(sessionId, pageId);
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
    const canAccess = await userCanAccessPage(
      user,
      body.pageId,
      memberModel,
      roleModel,
      getRequestTenantId(ctx),
    );
    if (!canAccess) return { ok: false };
    if (!(await ensureSessionOnPage(sessionId, body.pageId))) {
      return { ok: false };
    }
    await getPresenceTracker().acquire(
      sessionId,
      body.topic,
      body.key,
      buildActor(user),
    );
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
