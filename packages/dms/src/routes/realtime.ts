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
  getSessionInfo,
  getSessionSubscriptions,
  registerSession,
  setSessionPage,
  unregisterSession,
} from "../realtime/sessions";

const REALTIME_BASE = "/api/realtime";
const HELLO_EVENT = "hello";
const SNAPSHOT_EVENT = "snapshot";
const SESSION_HEADER = "x-realtime-session";

type RealtimeAck = { ok: boolean };

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

// Menu invalidations: the session's own tenant, plus the broadcast topic a
// NotifyMenuChanged() call that names no tenant lands on. The session subscribes
// to these and the greeting announces them, so both must read the same list.
const menuTopicsFor = (tenantId: string | undefined): string[] =>
  tenantId
    ? [MENU_BROADCAST_TOPIC, buildMenuTopic(tenantId)]
    : [MENU_BROADCAST_TOPIC];

const computeDesiredTopics = (sessionId: string): Set<string> => {
  const info = getSessionInfo(sessionId);
  const topics = new Set<string>();
  if (!info) return topics;
  if (info.user) topics.add(buildUserNotificationTopic(info.user._id));
  for (const topic of menuTopicsFor(info.tenantId)) topics.add(topic);
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
  @Get("/user")
  async userStream(
    @Context() ctx: RequestContext,
    @AuthRawUser() user: User,
  ): Promise<void> {
    const sessionId = randomUUID();
    const tenantId = getRequestTenantId(ctx);
    const stream = openSseStream(ctx);
    registerSession(sessionId, { user, tenantId, send: stream.send });
    // The menu topics travel with the greeting: the client cannot derive its
    // tenant's topic name on its own, and dispatch is keyed by topic.
    stream.send(HELLO_EVENT, {
      sessionId,
      ts: Date.now(),
      menuTopics: menuTopicsFor(tenantId),
    });
    let isClosed = false;
    stream.onClose(() => {
      isClosed = true;
      void cleanupSession(sessionId).catch((error) =>
        Logging.Warn("Realtime: cleanupSession failed", error),
      );
    });
    void applySessionTopics(sessionId).catch((error) => {
      if (isClosed) return;
      Logging.Warn("Realtime: applySessionTopics failed", error);
    });
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
  ): Promise<RealtimeAck> {
    if (!sessionId || !getSessionInfo(sessionId)) return { ok: false };
    const canAccess = await userCanAccessPage(
      user,
      pageId,
      memberModel,
      roleModel,
      getRequestTenantId(ctx),
    );
    assert(canAccess, 403, "error.forbidden");
    await ensureSessionOnPage(sessionId, pageId);
    return { ok: true };
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
