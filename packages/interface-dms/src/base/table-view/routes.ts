import {
  Context,
  JSONBody,
  MultiParameter,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import {
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  DefaultRoutes,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import { getRequestTenantId } from "../../request-tenant";
import { AuthUser } from "../../auth";
import type { User } from "../../auth/db";
import {
  authorizeAction,
  LIST_ACTION,
  SELECT_ACTION,
  VIEW_ACTION,
  withActionCheck,
  withActionCheckOptions,
} from "./auth";
import {
  archiveRows,
  countWithSearch,
  downloadExport,
  getExportStatus,
  listWithSearch,
  type RowBulkOperationParams,
  restoreRows,
  startExport,
} from "./data-functions";
import { withFilePromotion } from "./files";
import { createGuardedRoute, guardedGetRoute } from "./guards";
import {
  extractBulkArgIds,
  extractFromResult,
  extractMultiParamId,
  extractSingleParamId,
  withPresenceAcquire,
  withRealtimeMutation,
} from "./realtime";
import { createValidatedRoute } from "./row-rules";

const MAX_BATCH_COUNT_QUERIES = 50;

interface BatchCountQuery {
  id: string;
  query: Record<string, string | number | boolean | undefined>;
}

interface BatchCountBody {
  queries: BatchCountQuery[];
}

function parseBatchCountBody(body: unknown): BatchCountBody {
  assert(body && typeof body === "object", 400, "Invalid count batch body.");
  const queries = (body as Partial<BatchCountBody>).queries;
  assert(Array.isArray(queries), 400, "Invalid count batch queries.");
  assert(
    queries.length <= MAX_BATCH_COUNT_QUERIES,
    400,
    "Too many count batch queries.",
  );
  for (const query of queries) {
    assert(
      query && typeof query.id === "string" && query.query,
      400,
      "Invalid count batch query.",
    );
  }
  return { queries };
}

function buildBatchCountContext(
  ctx: RequestContext,
  query: BatchCountQuery["query"],
): RequestContext {
  const url = new URL(ctx.url);
  url.search = "";
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return { ...ctx, url };
}

const createBulkOperationRoute = (
  operationFunc: (...args: RowBulkOperationParams) => unknown,
): DataControllerCallback => ({
  func: function (ctx: RequestContext, ids: string | string[]) {
    return operationFunc(this, ctx, ids);
  },
  args: [Context(), Parameter("ids", "query")],
  method: "put",
});

function createListRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      listParams: Parameters.ListParameters,
      user: User,
    ) {
      const permissions = await authorizeAction(
        this,
        actionId,
        user,
        getRequestTenantId(ctx),
      );
      return listWithSearch(
        this as DataControllerCallback,
        ctx,
        listParams,
        user,
        permissions,
      );
    },
    args: [Context(), Parameters.List(), AuthUser()],
    method: "get" as const,
  };
}

function createCountRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      listParams: Parameters.ListParameters,
      user: User,
    ) {
      const permissions = await authorizeAction(
        this,
        actionId,
        user,
        getRequestTenantId(ctx),
      );
      return countWithSearch(
        this as DataControllerCallback,
        ctx,
        listParams,
        user,
        permissions,
      );
    },
    args: [Context(), Parameters.List(), AuthUser()],
    method: "get" as const,
  };
}

function createBatchCountRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      body: unknown,
      user: User,
    ) {
      const parsed = parseBatchCountBody(body);
      const permissions = await authorizeAction(
        this,
        actionId,
        user,
        getRequestTenantId(ctx),
      );
      const meta = GetDataControllerMeta(this);
      const entries = await Promise.all(
        parsed.queries.map(async ({ id, query }) => {
          const queryContext = buildBatchCountContext(ctx, query);
          const listParams = {
            filters: Parameters.ExtractFilters(queryContext, meta),
          };
          const result = await countWithSearch(
            this as DataControllerCallback,
            queryContext,
            listParams,
            user,
            permissions,
          );
          return [id, result.total] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    args: [Context(), JSONBody(), AuthUser()],
    method: "post" as const,
  };
}

function createEditRoute(
  baseRoute: DataControllerCallback,
): DataControllerCallback {
  return withRealtimeMutation(
    { eventType: "updated", extractIds: extractSingleParamId },
    withActionCheck(
      "edit",
      createGuardedRoute(
        createValidatedRoute(withFilePromotion(baseRoute), "edit"),
        "edit",
      ),
    ),
  );
}

export namespace TableViewRoutes {
  export const Get = withPresenceAcquire(
    withActionCheck(VIEW_ACTION, guardedGetRoute),
  );
  export const List = createListRoute(LIST_ACTION);
  export const Select = DefaultRoutes.WithOptions(
    createListRoute(SELECT_ACTION),
    {
      pluckMode: "select",
    },
  );
  /**
   * `GET <location>/count`: the row count for one filter set. It does not
   * serve the filter tab counters, which go through {@link CountBatch}.
   */
  export const Count = createCountRoute(LIST_ACTION);
  /**
   * `POST <location>/count/batch`: one count per query, in a single request.
   * Filter tabs with counters require the controller to mount
   * `countBatch: TableViewRoutes.CountBatch`; a table view declaring `tabs`
   * without it gets failing counters and a registration warning.
   */
  export const CountBatch = DefaultRoutes.WithOptions(
    createBatchCountRoute(LIST_ACTION),
    {},
    "/count/batch",
  );
  export const New = withRealtimeMutation(
    { eventType: "created", extractIds: extractFromResult },
    withActionCheck(
      "add",
      createGuardedRoute(withFilePromotion(DefaultRoutes.New), "new"),
    ),
  );
  export const Edit = createEditRoute(DefaultRoutes.Edit);
  /**
   * `Edit` around another write: the permission check, guard, row rules, file
   * promotion and realtime broadcast still wrap it, so it runs only once the
   * edit is allowed. `baseRoute` takes the arguments of `DefaultRoutes.Edit`,
   * which it typically calls to write the row.
   */
  export const EditWith = createEditRoute;
  export const Delete = withRealtimeMutation(
    { eventType: "deleted", extractIds: extractMultiParamId },
    withActionCheck(
      "delete",
      createGuardedRoute(
        createValidatedRoute(
          withFilePromotion(DefaultRoutes.Delete, "delete"),
          "delete",
        ),
        "delete",
      ),
    ),
  );
  export const Archive = withRealtimeMutation(
    { eventType: "updated", extractIds: extractBulkArgIds },
    withActionCheck(
      "archive",
      createGuardedRoute(
        createValidatedRoute(createBulkOperationRoute(archiveRows), "archive"),
        "archive",
      ),
    ),
  );
  export const Restore = withRealtimeMutation(
    { eventType: "updated", extractIds: extractBulkArgIds },
    withActionCheck(
      "restore",
      createGuardedRoute(
        createValidatedRoute(createBulkOperationRoute(restoreRows), "restore"),
        "restore",
      ),
    ),
  );

  export const ExportRoutes: Record<
    string,
    DataControllerCallback | DataControllerCallbackWithOptions
  > = {
    exportStart: withActionCheckOptions(
      "export",
      DefaultRoutes.WithOptions(
        {
          // A published contract: the runtime calls this positionally and every
          // implementing module declares the same shape, so an options object
          // cannot be introduced from this side.
          // oxlint-disable-next-line eslint/max-params
          func: function (
            ctx: RequestContext,
            listParams: Parameters.ListParameters,
            format: string | undefined,
            delivery: string | undefined,
            ids: string[],
            user: User,
          ) {
            return startExport(
              this,
              ctx,
              listParams,
              format,
              delivery,
              ids,
              user,
            );
          },
          args: [
            Context(),
            Parameters.List(),
            Parameter("format", "query"),
            Parameter("delivery", "query"),
            MultiParameter("ids", "query"),
            AuthUser(),
          ],
          method: "get",
        },
        { pluckMode: "export" },
        "/export/start",
      ),
    ),
    exportStatus: withActionCheckOptions("export", {
      endpoint: "/export/status/:exportId",
      callback: {
        func: function (ctx: RequestContext, exportId: string, user: User) {
          return getExportStatus(this, ctx, exportId, user);
        },
        args: [Context(), Parameter("exportId", "param"), AuthUser()],
        method: "get",
      },
    }),
    exportDownload: withActionCheckOptions("export", {
      endpoint: "/export/download/:exportId",
      callback: {
        func: function (ctx: RequestContext, exportId: string, user: User) {
          return downloadExport(this, ctx, exportId, user);
        },
        args: [Context(), Parameter("exportId", "param"), AuthUser()],
        method: "get",
      },
    }),
  };

  export const All = {
    get: Get,
    list: List,
    select: Select,
    count: Count,
    countBatch: CountBatch,
    new: New,
    edit: Edit,
    delete: Delete,
    archive: Archive,
    restore: Restore,
    ...ExportRoutes,
  } as const;
}
