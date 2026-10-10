import { Parameter } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { AuthUser } from "../../../auth";
import type { User } from "../../../auth/db";
import { RegisterPageTopic } from "../../../realtime";
import { getControllerLocation, getTableViewMetaFor } from "./meta";
import { realtimeMutationListeners } from "./realtime-listeners";
import {
  type RealtimeMutationContext,
  type RealtimeMutationEventType,
  internal,
  tableViewPresenceTopic,
  tableViewRowTopic,
} from "../realtime";

const REALTIME_SESSION_HEADER = "x-realtime-session";
/** @internal */
export const REALTIME_PRESENCE_QUERY = "_presence";
/** @internal */
export const REALTIME_PRESENCE_ACQUIRE_VALUE = "1";
const PARAMS_INDEX = 1;
const BULK_IDS_ARG_INDEX = 1;

/**
 * Bind the topics of the table view served at `controllerLocation` to the page
 * it is placed on. Called from the builder's `onCreated`, so the module whose
 * page it is owns them.
 *
 * @internal
 */
export function registerTableViewPageTopics(
  pageId: string,
  controllerLocation: string,
): void {
  RegisterPageTopic(pageId, tableViewRowTopic(controllerLocation));
  RegisterPageTopic(pageId, tableViewPresenceTopic(controllerLocation));
}

/**
 * Bind the topics a table view's `realtimeTopic` names to the page it is
 * placed on, so a session on that page may subscribe to them.
 *
 * @internal
 */
export function registerTableViewCustomTopics(
  pageId: string,
  topic: string | string[] | undefined,
): void {
  if (!topic) return;
  for (const entry of Array.isArray(topic) ? topic : [topic]) {
    RegisterPageTopic(pageId, entry);
  }
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

/** @internal */
export const extractFromResult: IdExtractor = (_args, result, idKey) => {
  if (!result || typeof result !== "object") return [];
  const value = (result as Record<string, unknown>)[idKey];
  return typeof value === "string" ? [value] : [];
};

/** @internal */
export const extractSingleParamId: IdExtractor = (args) => {
  const params = args[PARAMS_INDEX] as { id?: string } | undefined;
  return params?.id ? [params.id] : [];
};

/** @internal */
export const extractMultiParamId: IdExtractor = (args) => {
  const params = args[PARAMS_INDEX] as { id?: string | string[] } | undefined;
  if (!params?.id) return [];
  return Array.isArray(params.id) ? params.id : [params.id];
};

/** @internal */
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
/** @internal */
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

/** @internal */
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

/** @internal */
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
