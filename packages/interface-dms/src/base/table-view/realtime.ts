import { Parameter } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { AuthUser } from "../../auth";
import type { User } from "../../auth/db";
import { RegisterPageTopic } from "../../realtime";
import { OwnedRegistry } from "../../utils/owned-registry";
import { getControllerLocation, getTableViewMetaFor } from "./meta";

const REALTIME_SESSION_HEADER = "x-realtime-session";
export const REALTIME_PRESENCE_QUERY = "_presence";
export const REALTIME_PRESENCE_ACQUIRE_VALUE = "1";
const PARAMS_INDEX = 1;
const BULK_IDS_ARG_INDEX = 1;
const ROW_TOPIC_PREFIX = "tableview:row:";
const PRESENCE_TOPIC_PREFIX = "tableview:presence:";

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

/**
 * The topic the row changes of the table view served at `controllerLocation`
 * are published on.
 */
export function tableViewRowTopic(controllerLocation: string): string {
  return `${ROW_TOPIC_PREFIX}${controllerLocation}`;
}

/**
 * The topic the presence on the rows of the table view served at
 * `controllerLocation` is tracked on.
 */
export function tableViewPresenceTopic(controllerLocation: string): string {
  return `${PRESENCE_TOPIC_PREFIX}${controllerLocation}`;
}

/**
 * Bind the topics of the table view served at `controllerLocation` to the page
 * it is placed on. Called from the builder's `onCreated`, so the module whose
 * page it is owns them.
 */
export function registerTableViewPageTopics(
  pageId: string,
  controllerLocation: string,
): void {
  RegisterPageTopic(pageId, tableViewRowTopic(controllerLocation));
  RegisterPageTopic(pageId, tableViewPresenceTopic(controllerLocation));
}

/**
 * @internal
 */
export namespace internal {
  /** Delivers a mutation of a table view's rows to the sessions watching it. */
  export const PublishMutation =
    InterfaceFunction<(context: RealtimeMutationContext) => Promise<void>>();

  /** Records that a session holds a row of a table view open. */
  export const AcquirePresence =
    InterfaceFunction<(context: RealtimePresenceContext) => Promise<void>>();
}

type RealtimeMutationListener = (
  context: RealtimeMutationContext,
) => void | Promise<void>;

const realtimeMutationListeners = new OwnedRegistry<RealtimeMutationListener>();

/**
 * Register an additional realtime-mutation listener. Listeners are additive
 * side observers: they run after the DMS has published the mutation, and their
 * failures are logged, never propagated to the mutating request.
 *
 * The listener belongs to the module generation that registers it and is
 * released when that generation is destroyed, so a reloaded module does not
 * leave its previous listener behind. Registering one already registered is a
 * no-op.
 */
export function registerRealtimeMutationListener(
  listener: RealtimeMutationListener,
): void {
  if (realtimeMutationListeners.has((registered) => registered === listener)) {
    return;
  }
  realtimeMutationListeners.add(listener);
}

/** Drop a listener, for a module that stops listening while it stays loaded. */
export function unregisterRealtimeMutationListener(
  listener: RealtimeMutationListener,
): void {
  realtimeMutationListeners.remove((registered) => registered === listener);
}

async function dispatchRealtimeMutation(
  context: RealtimeMutationContext,
): Promise<void> {
  await internal.PublishMutation(context);
  for (const listener of realtimeMutationListeners.values()) {
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

// The counts the bulk routes answer with: delete sends the number of deleted
// rows (or `{ deleted }`), archive and restore `{ archivedCount }` and
// `{ restoredCount }`.
const CHANGED_COUNT_KEYS = ["deleted", "archivedCount", "restoredCount"];

/**
 * Whether a write reports changing no row: its row rules refused every id,
 * or none existed. Broadcasting its ids would have every session watching
 * the table (the caller included) drop rows that are still there.
 */
// @internal
export const reportsNoChange = (result: unknown): boolean => {
  if (typeof result === "number") return result === 0;
  if (!result || typeof result !== "object") return false;
  const counts = CHANGED_COUNT_KEYS.map(
    (key) => (result as Record<string, unknown>)[key],
  ).filter((value): value is number => typeof value === "number");
  return counts.length > 0 && counts.every((count) => count === 0);
};

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
      if (!isRealtimeEnabled(this)) return result;
      const meta = getTableViewMetaFor(this);
      const idKey = meta.options.rowIdKey || "_id";
      const ids = config.extractIds(allArgs, result, idKey);
      if (ids.length === 0 && config.eventType !== "created") return result;
      if (config.eventType !== "created" && reportsNoChange(result)) {
        return result;
      }
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
        !sessionId ||
        !isRealtimeEnabled(this)
      ) {
        return result;
      }
      const params = allArgs[PARAMS_INDEX] as { id?: string } | undefined;
      if (!params?.id) return result;
      const meta = getTableViewMetaFor(this);
      await internal.AcquirePresence({
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
