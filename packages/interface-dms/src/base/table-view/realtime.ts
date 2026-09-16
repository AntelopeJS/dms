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

const pendingPageTopics: RealtimePageTopicContext[] = [];

const realtimeMutationListeners = new Set<RealtimeMutationHook>();

export function setRealtimeMutationHook(hook: RealtimeMutationHook): void {
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

export function setRealtimePresenceHook(hook: RealtimePresenceHook): void {
  realtimeHooks.presence = hook;
}

export function setRealtimePageTopicHook(hook: RealtimePageTopicHook): void {
  realtimeHooks.pageTopic = hook;
  while (pendingPageTopics.length > 0) {
    const context = pendingPageTopics.shift();
    if (context) hook(context);
  }
}

export function reportRealtimePageTopic(
  context: RealtimePageTopicContext,
): void {
  if (realtimeHooks.pageTopic) {
    realtimeHooks.pageTopic(context);
    return;
  }
  pendingPageTopics.push(context);
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
