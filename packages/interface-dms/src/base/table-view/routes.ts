import {
  Context,
  JSONBody,
  MultiParameter,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  type DataControllerCallbackWithOptions,
  DefaultRoutes,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import {
  Parameters,
  type Validation,
} from "@antelopejs/interface-data-api/components";
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
  withParamsActionCheck,
} from "./internal/auth";
import {
  archiveRows,
  countWithSearch,
  downloadExport,
  getExportStatus,
  listWithSearch,
  restoreRows,
  startExport,
  summarizeWithSearch,
  type TableViewListPage,
} from "./data-functions";
import type { RowBulkOperationParams } from "./internal/data-functions";
import { withFilePromotion } from "./internal/files";
import { withColumnConditions } from "./internal/column-conditions";
import {
  createGuardedConfirmRoute,
  createGuardedWriteRoute,
  guardedGetRoute,
} from "./internal/guards";
import {
  extractBulkArgIds,
  extractFromResult,
  extractMultiParamId,
  extractSingleParamId,
  withPresenceAcquire,
  withRealtimeMutation,
} from "./internal/realtime";
import { TableViewMeta } from "./meta";
import type { TableViewFooterSummary } from "./options";
import { createValidatedRoute } from "./internal/row-rules";

const MAX_BATCH_COUNT_QUERIES = 50;

/** One query value; a list repeats its key (`filter_x=a&filter_x=b`). */
type BatchCountQueryValue = string | number | boolean | string[] | undefined;

interface BatchCountQuery {
  id: string;
  query: Record<string, BatchCountQueryValue>;
}

interface BatchCountBody {
  queries: BatchCountQuery[];
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser is the JSONBody boundary of the published count-batch route; it must accept arbitrary decoded request values before checking them.
function parseBatchCountBody(body: unknown): BatchCountBody {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSONBody supplies untyped input; this existing parser rejects non-object request bodies before inspecting queries.
  assert(body && typeof body === "object", 400, "Invalid count batch body.");
  const { queries }: Partial<BatchCountBody> = body;
  assert(Array.isArray(queries), 400, "Invalid count batch queries.");
  assert(
    queries.length <= MAX_BATCH_COUNT_QUERIES,
    400,
    "Too many count batch queries.",
  );
  for (const query of queries) {
    assert(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The count-batch parser checks each request entry's id representation; a stronger schema would reject inputs currently accepted by this published route.
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
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(item));
    }
  }
  return { ...ctx, url };
}

type BulkOperationResult =
  | ReturnType<typeof archiveRows>
  | ReturnType<typeof restoreRows>;

const createBulkOperationRoute = (
  operationFunc: (...args: RowBulkOperationParams) => BulkOperationResult,
): DataControllerCallback<
  unknown,
  Awaited<BulkOperationResult>,
  [RequestContext, string[]]
> => ({
  func: function (ctx: RequestContext, ids: string[]) {
    assert(ids.length > 0, 400, "Missing ids.");
    return operationFunc(this, ctx, ids);
  },
  args: [Context(), MultiParameter("ids", "query")],
  method: "put",
});

function createListRoute(
  actionId: string,
): DataControllerCallback<
  Parameters.ListParameters,
  TableViewListPage,
  [RequestContext, Parameters.ListParameters, User]
> {
  return {
    func: async function (
      this: globalThis.Parameters<typeof listWithSearch>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
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
      return listWithSearch(this, ctx, listParams, user, permissions);
    },
    args: [Context(), Parameters.List(), AuthUser()],
    method: "get" as const,
  };
}

function createCountRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: globalThis.Parameters<typeof listWithSearch>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
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
      return countWithSearch(this, ctx, listParams, user, permissions);
    },
    args: [Context(), Parameters.List(), AuthUser()],
    method: "get" as const,
  };
}

/** The footer summaries a request names, refusing an id never declared. */
function requestedSummaries(
  thisObj: globalThis.Parameters<typeof listWithSearch>[0] & {
    constructor: ConstructorParameters<typeof TableViewMeta>[0];
  },
  ids: string[],
) {
  const meta = GetMetadata(thisObj.constructor, TableViewMeta);
  const summaries: Record<string, TableViewFooterSummary> = {};
  for (const id of ids) {
    const summary = meta.footerSummary(id);
    assert(summary, 400, `Unknown footer summary "${id}".`);
    summaries[id] = summary;
  }
  return summaries;
}

function createSummaryRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: globalThis.Parameters<typeof listWithSearch>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
      ctx: RequestContext,
      listParams: Parameters.ListParameters,
      ids: string[],
      user: User,
    ) {
      const summaries = requestedSummaries(this, ids);
      const permissions = await authorizeAction(
        this,
        actionId,
        user,
        getRequestTenantId(ctx),
      );
      return summarizeWithSearch(
        this,
        ctx,
        listParams,
        summaries,
        user,
        permissions,
      );
    },
    args: [
      Context(),
      Parameters.List(),
      MultiParameter("ids", "query"),
      AuthUser(),
    ],
    method: "get" as const,
  };
}

function createBatchCountRoute(actionId: string): DataControllerCallback {
  return {
    func: async function (
      this: globalThis.Parameters<typeof listWithSearch>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
      ctx: RequestContext,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSONBody is decoded by parseBatchCountBody below; its published route boundary must still accept arbitrary request values.
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
            this,
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

function createEditRoute<O, R>(
  baseRoute: DataControllerCallback<
    O,
    R,
    [RequestContext, Parameters.EditParameters, Validation.WrittenBody]
  >,
) {
  return withRealtimeMutation(
    { eventType: "updated", extractIds: extractSingleParamId },
    withActionCheck(
      "edit",
      withColumnConditions(
        createGuardedWriteRoute(
          createValidatedRoute(withFilePromotion(baseRoute), "edit"),
          "edit",
        ),
        "edit",
      ),
    ),
  );
}

export namespace TableViewRoutes {
  export const Get = withPresenceAcquire(
    withParamsActionCheck(VIEW_ACTION, guardedGetRoute),
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
  /**
   * `GET <location>/summary?ids=<id>`: the footer summaries a table view
   * declared (`footer.summary`), computed over every row its filters and
   * search list. Mount it as `summary: TableViewRoutes.Summary`; a table view
   * declaring summaries without it gets a registration warning.
   */
  export const Summary = DefaultRoutes.WithOptions(
    createSummaryRoute(LIST_ACTION),
    {},
    "/summary",
  );
  export const New = withRealtimeMutation(
    { eventType: "created", extractIds: extractFromResult },
    withActionCheck(
      "add",
      withColumnConditions(
        createGuardedWriteRoute(withFilePromotion(DefaultRoutes.New), "new"),
        "new",
      ),
    ),
  );
  /**
   * `PUT <location>/edit`: a partial update. Only the fields the body carries
   * change: a field left out keeps its stored value, `null` (or an empty
   * value) clears it. A mandatory field may be left out but not cleared.
   */
  export const Edit = createEditRoute(DefaultRoutes.Edit);
  /**
   * `Edit` around another write: the permission check, guard, row rules, file
   * promotion and realtime broadcast still wrap it, so it runs only once the
   * edit is allowed. `baseRoute` takes the arguments of `DefaultRoutes.Edit`,
   * and typically calls it to write the row.
   */
  export const EditWith = createEditRoute;
  export const Delete = withRealtimeMutation(
    { eventType: "deleted", extractIds: extractMultiParamId },
    withActionCheck(
      "delete",
      createGuardedConfirmRoute(
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
      createGuardedConfirmRoute(
        createValidatedRoute(createBulkOperationRoute(archiveRows), "archive"),
        "archive",
      ),
    ),
  );
  export const Restore = withRealtimeMutation(
    { eventType: "updated", extractIds: extractBulkArgIds },
    withActionCheck(
      "restore",
      createGuardedConfirmRoute(
        createValidatedRoute(createBulkOperationRoute(restoreRows), "restore"),
        "restore",
      ),
    ),
  );

  export const ExportRoutes: Record<
    string,
    DataControllerCallback | DataControllerCallbackWithOptions
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- The published export is an open callback dictionary; inference or satisfies would expose narrower named route members and change its declaration.
  > = {
    exportStart: DefaultRoutes.WithOptions(
      {
        func: async function (
          this: globalThis.Parameters<typeof startExport>[0],
          ...routeArgs: [
            RequestContext,
            Parameters.ListParameters,
            string | undefined,
            string | undefined,
            string[],
            User,
            User,
          ]
        ) {
          const [ctx, listParams, format, delivery, ids, user, checkedUser] =
            routeArgs;
          await authorizeAction(
            this,
            "export",
            checkedUser,
            getRequestTenantId(ctx),
          );
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
          AuthUser(),
        ],
        method: "get",
      },
      { pluckMode: "export" },
      "/export/start",
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
    summary: Summary,
    new: New,
    edit: Edit,
    delete: Delete,
    archive: Archive,
    restore: Restore,
    ...ExportRoutes,
  } as const;
}
