import { Parameter } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { AuthUser } from "../../auth";
import type { User } from "../../auth/db";
import { getControllerLocation, getTableViewMetaFor } from "./meta";

const REALTIME_SESSION_HEADER = "x-realtime-session";
export const REALTIME_PRESENCE_QUERY = "_presence";
export const REALTIME_PRESENCE_ACQUIRE_VALUE = "1";
const PARAMS_INDEX = 1;
const BULK_IDS_ARG_INDEX = 1;

export type RealtimeMutationEventType = "created" | "updated" | "deleted";

export interface RealtimeMutationContext {
  controllerLocation: string;
  rowIdKey: string;
  eventType: RealtimeMutationEventType;
  ids: string[];
  sessionId?: string;
  actor?: RealtimePresenceActor;
}

export interface RealtimePresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface RealtimePresenceContext {
  controllerLocation: string;
  rowIdKey: string;
  sessionId: string;
  rowId: string;
  actor: RealtimePresenceActor;
}

export interface RealtimePageTopicContext {
  pageId: string;
  controllerLocation: string;
}

type RealtimeMutationHook = (
  context: RealtimeMutationContext,
) => void | Promise<void>;
type RealtimePresenceHook = (
  context: RealtimePresenceContext,
) => void | Promise<void>;
type RealtimePageTopicHook = (context: RealtimePageTopicContext) => void;

const realtimeHooks: {
  mutation?: RealtimeMutationHook;
  presence?: RealtimePresenceHook;
  pageTopic?: RealtimePageTopicHook;
} = {};

// Every page topic reported so far, by page then controller. The page topic
// hook belongs to one generation of the DMS module; when it comes back after a
// hot reload, the pages of other modules do not register again, so the new
// hook is handed all of them — not only those reported before any hook.
const reportedPageTopics = new Map<
  string,
  Map<string, RealtimePageTopicContext>
>();

const realtimeMutationListeners = new Set<RealtimeMutationHook>();

/**
 * Install the hook the DMS module handles mutations with, or release it with
 * `undefined` when that module shuts down: a hook left behind belongs to a
 * module context that no longer exists, and calling it throws.
 */
export function setRealtimeMutationHook(
  hook: RealtimeMutationHook | undefined,
): void {
  realtimeHooks.mutation = hook;
}

/**
 * Register an additional realtime-mutation listener. Unlike
 * `setRealtimeMutationHook` — a single slot owned by the realtime bridge —
 * listeners are additive and side observers: they run after the bridge hook
 * and their failures are logged, never propagated to the mutating request.
 */
export function registerRealtimeMutationListener(
  listener: RealtimeMutationHook,
): void {
  realtimeMutationListeners.add(listener);
}

export function unregisterRealtimeMutationListener(
  listener: RealtimeMutationHook,
): void {
  realtimeMutationListeners.delete(listener);
}

function hasRealtimeMutationConsumers(): boolean {
  return !!realtimeHooks.mutation || realtimeMutationListeners.size > 0;
}

async function dispatchRealtimeMutation(
  context: RealtimeMutationContext,
): Promise<void> {
  if (realtimeHooks.mutation) {
    await realtimeHooks.mutation(context);
  }
  for (const listener of realtimeMutationListeners) {
    try {
      await listener(context);
    } catch (error) {
      Logging.Error(
        `[DMS] Realtime mutation listener failed for '${context.controllerLocation}':`,
        error,
      );
    }
  }
}

/** Install or release (`undefined`) the presence hook, as `setRealtimeMutationHook`. */
export function setRealtimePresenceHook(
  hook: RealtimePresenceHook | undefined,
): void {
  realtimeHooks.presence = hook;
}

/**
 * Install the page topic hook and hand it every topic reported so far, or
 * release it with `undefined`, as `setRealtimeMutationHook`.
 */
export function setRealtimePageTopicHook(
  hook: RealtimePageTopicHook | undefined,
): void {
  realtimeHooks.pageTopic = hook;
  if (!hook) return;
  for (const topics of reportedPageTopics.values()) {
    for (const context of topics.values()) hook(context);
  }
}

export function reportRealtimePageTopic(
  context: RealtimePageTopicContext,
): void {
  let topics = reportedPageTopics.get(context.pageId);
  if (!topics) {
    topics = new Map();
    reportedPageTopics.set(context.pageId, topics);
  }
  topics.set(context.controllerLocation, context);
  realtimeHooks.pageTopic?.(context);
}

/**
 * Forget the topics of a page that went away, so a hook installed later is not
 * handed a surface that no longer serves.
 */
export function forgetRealtimePageTopics(pageId: string): void {
  reportedPageTopics.delete(pageId);
}

type IdExtractor = (
  args: unknown[],
  result: unknown,
  idKey: string,
) => string[];

export const extractFromResult: IdExtractor = (_args, result, idKey) => {
  if (!result || typeof result !== "object") return [];
  const value = (result as Record<string, unknown>)[idKey];
  return typeof value === "string" ? [value] : [];
};

export const extractSingleParamId: IdExtractor = (args) => {
  const params = args[PARAMS_INDEX] as { id?: string } | undefined;
  return params?.id ? [params.id] : [];
};

export const extractMultiParamId: IdExtractor = (args) => {
  const params = args[PARAMS_INDEX] as { id?: string | string[] } | undefined;
  if (!params?.id) return [];
  return Array.isArray(params.id) ? params.id : [params.id];
};

export const extractBulkArgIds: IdExtractor = (args) => {
  const ids = args[BULK_IDS_ARG_INDEX] as string | string[] | undefined;
  if (!ids) return [];
  return Array.isArray(ids) ? ids : [ids];
};

const isRealtimeEnabled = (target: unknown): boolean =>
  getTableViewMetaFor(target).options.realtime !== false;

interface MutationConfig {
  eventType: RealtimeMutationEventType;
  extractIds: IdExtractor;
}

export function withRealtimeMutation<T extends DataControllerCallback>(
  config: MutationConfig,
  baseRoute: T,
): DataControllerCallback {
  return {
    method: baseRoute.method,
    args: [
      ...baseRoute.args,
      Parameter(REALTIME_SESSION_HEADER, "header"),
      AuthUser(),
    ],
    func: async function (this: unknown, ...allArgs: unknown[]) {
      const user = allArgs.pop() as User;
      const sessionId = allArgs.pop() as string | undefined;
      const result = await (
        baseRoute.func as (...a: unknown[]) => unknown
      ).apply(this, allArgs);
      if (!hasRealtimeMutationConsumers() || !isRealtimeEnabled(this))
        return result;
      const meta = getTableViewMetaFor(this);
      const idKey = meta.options.rowIdKey || "_id";
      const ids = config.extractIds(allArgs, result, idKey);
      if (ids.length === 0 && config.eventType !== "created") return result;
      await dispatchRealtimeMutation({
        controllerLocation: getControllerLocation(this),
        rowIdKey: idKey,
        eventType: config.eventType,
        ids,
        sessionId,
        actor: { id: user._id, displayName: user.name || user.email },
      });
      return result;
    },
  };
}

export function withPresenceAcquire<T extends DataControllerCallback>(
  baseRoute: T,
): DataControllerCallback {
  return {
    method: baseRoute.method,
    args: [
      ...baseRoute.args,
      Parameter(REALTIME_SESSION_HEADER, "header"),
      Parameter(REALTIME_PRESENCE_QUERY, "query"),
      AuthUser(),
    ],
    func: async function (this: unknown, ...allArgs: unknown[]) {
      const user = allArgs.pop() as User;
      const presenceFlag = allArgs.pop() as string | undefined;
      const sessionId = allArgs.pop() as string | undefined;
      const result = await (
        baseRoute.func as (...a: unknown[]) => unknown
      ).apply(this, allArgs);
      if (
        presenceFlag !== REALTIME_PRESENCE_ACQUIRE_VALUE ||
        !realtimeHooks.presence ||
        !sessionId ||
        !isRealtimeEnabled(this)
      ) {
        return result;
      }
      const params = allArgs[PARAMS_INDEX] as { id?: string } | undefined;
      if (!params?.id) return result;
      const meta = getTableViewMetaFor(this);
      await realtimeHooks.presence({
        controllerLocation: getControllerLocation(this),
        rowIdKey: meta.options.rowIdKey || "_id",
        sessionId,
        rowId: params.id,
        actor: { id: user._id, displayName: user.name || user.email },
      });
      return result;
    },
  };
}
