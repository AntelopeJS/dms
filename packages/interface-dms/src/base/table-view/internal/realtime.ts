import {
  Context,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import { GetMetadata } from "@antelopejs/interface-core";
import { AuthUser } from "../../../auth";
import { CORE_SCHEMA_NAME } from "../../../constants";
import type { User } from "../../../auth/db";
import { RegisterPageTopic } from "../../../realtime";
import { getRequestTenantId } from "../../../request-tenant";
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

/**
 * The ids a write changed, read from the route's arguments (the request
 * context, the route's parameters, then the rest) or from its answer.
 */
type IdExtractor<P> = (
  args: readonly [RequestContext, P, ...unknown[]],
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The published extractor accepts results from arbitrary wrapped callbacks; only the extractor can interpret the result's id convention.
  result: unknown,
  idKey: string,
) => string[];

/** @internal */
export const extractFromResult: IdExtractor<unknown> = (
  _args,
  result,
  idKey,
) => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The published extractor accepts arbitrary callback results and only inspects non-null objects for an id.
  if (!result || typeof result !== "object") return [];
  // SAFETY: The preceding check establishes a non-null object; indexing reads an unknown value and the next check accepts only strings.
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The published extractor reads a configurable key from module-owned result objects; no shared row schema exists here.
  const value = (result as Record<string, unknown>)[idKey];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Callback results are deliberately untyped in the published extractor; an id is emitted only for the string variant.
  return typeof value === "string" ? [value] : [];
};

/** @internal */
export const extractSingleParamId: IdExtractor<{ id?: string } | undefined> = (
  args,
) => {
  const params = args[PARAMS_INDEX];
  return params?.id ? [params.id] : [];
};

/** @internal */
export const extractMultiParamId: IdExtractor<
  { id?: string | string[] } | undefined
> = (args) => {
  const params = args[PARAMS_INDEX];
  if (!params?.id) return [];
  return Array.isArray(params.id) ? params.id : [params.id];
};

/** @internal */
export const extractBulkArgIds: IdExtractor<string | string[] | undefined> = (
  args,
) => {
  const ids = args[BULK_IDS_ARG_INDEX];
  if (!ids) return [];
  return Array.isArray(ids) ? ids : [ids];
};

const isRealtimeEnabled = (target: {
  constructor: ConstructorParameters<typeof DataAPIMeta>[0];
}): boolean => getTableViewMetaFor(target).options.realtime !== false;

/**
 * The tenant a table's realtime events are published for: the request's,
 * unless the table's rows live in the schema every tenant shares.
 */
const realtimeTenantOf = (
  target: { constructor: ConstructorParameters<typeof DataAPIMeta>[0] },
  ctx: RequestContext,
): string | undefined =>
  GetMetadata(target.constructor, DataAPIMeta).schemaName === CORE_SCHEMA_NAME
    ? undefined
    : getRequestTenantId(ctx);

const CHANGED_COUNT_KEYS: ["deleted", "archivedCount", "restoredCount"] = [
  "deleted",
  "archivedCount",
  "restoredCount",
];

/**
 * Whether a write reports changing no row: its row rules refused every id,
 * or none existed. Broadcasting its ids would have every session watching
 * the table (the caller included) drop rows that are still there.
 */
/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published predicate accepts heterogeneous callback results; restricting it to a row or count schema would change its accepted inputs.
export const reportsNoChange = (result: unknown): boolean => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The published predicate recognizes the numeric count convention alongside object count results.
  if (typeof result === "number") return result === 0;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only non-null object results can carry named mutation counts; other published input variants report no count.
  if (!result || typeof result !== "object") return false;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Mutation callbacks own these count values; the numeric filter below interprets them without changing the published result contract.
  const input: Partial<Record<(typeof CHANGED_COUNT_KEYS)[number], unknown>> =
    result;
  const counts = CHANGED_COUNT_KEYS.map((key) => input[key]).filter(
    (value): value is number => typeof value === "number",
  );
  return counts.length > 0 && counts.every((count) => count === 0);
};

interface MutationConfig<P> {
  eventType: RealtimeMutationEventType;
  extractIds: IdExtractor<P>;
}

type RealtimeController = {
  constructor: ConstructorParameters<typeof DataAPIMeta>[0];
};

/**
 * `baseRoute` (a write behind its permission check) followed by the realtime
 * broadcast of the rows it changed: the route takes the request context, the
 * realtime session header and the user after the arguments of `baseRoute`.
 *
 * @internal
 */
export function withRealtimeMutation<O, R, P, B>(
  config: MutationConfig<P>,
  baseRoute: DataControllerCallback<O, R, [RequestContext, P, B, User]>,
): DataControllerCallback<
  O,
  R,
  [RequestContext, P, B, User, RequestContext, string | undefined, User]
> {
  return {
    method: baseRoute.method,
    args: [
      ...baseRoute.args,
      Context(),
      Parameter(REALTIME_SESSION_HEADER, "header"),
      AuthUser(),
    ],
    func: async function (this: RealtimeController, ...routeArgs) {
      const [routeCtx, params, body, routeUser, ctx, sessionId, user] =
        routeArgs;
      const result = await baseRoute.func.call(
        this,
        routeCtx,
        params,
        body,
        routeUser,
      );
      if (!isRealtimeEnabled(this)) return result;
      const meta = getTableViewMetaFor(this);
      const idKey = meta.options.rowIdKey || "_id";
      const ids = config.extractIds(
        [routeCtx, params, body, routeUser],
        result,
        idKey,
      );
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
        tenantId: realtimeTenantOf(this, ctx),
      });
      return result;
    },
  };
}

/**
 * `baseRoute` (a read behind its permission check) that also takes the
 * presence of the session on the row it reads when the request asks: the
 * route takes the request context, the realtime session header, the presence
 * query and the user after the arguments of `baseRoute`.
 *
 * @internal
 */
export function withPresenceAcquire<O, R, P extends { id?: string }>(
  baseRoute: DataControllerCallback<O, R, [RequestContext, P, User]>,
): DataControllerCallback<
  O,
  R,
  [
    RequestContext,
    P,
    User,
    RequestContext,
    string | undefined,
    string | undefined,
    User,
  ]
> {
  return {
    method: baseRoute.method,
    args: [
      ...baseRoute.args,
      Context(),
      Parameter(REALTIME_SESSION_HEADER, "header"),
      Parameter(REALTIME_PRESENCE_QUERY, "query"),
      AuthUser(),
    ],
    func: async function (this: RealtimeController, ...routeArgs) {
      const [routeCtx, params, routeUser, ctx, sessionId, presenceFlag, user] =
        routeArgs;
      const result = await baseRoute.func.call(
        this,
        routeCtx,
        params,
        routeUser,
      );
      if (
        presenceFlag !== REALTIME_PRESENCE_ACQUIRE_VALUE ||
        !sessionId ||
        !isRealtimeEnabled(this)
      ) {
        return result;
      }
      if (!params.id) return result;
      const meta = getTableViewMetaFor(this);
      await internal.AcquirePresence({
        controllerLocation: getControllerLocation(this),
        rowIdKey: meta.options.rowIdKey || "_id",
        sessionId,
        rowId: params.id,
        actor: { id: user._id, displayName: user.name || user.email },
        tenantId: realtimeTenantOf(this, ctx),
      });
      return result;
    },
  };
}
