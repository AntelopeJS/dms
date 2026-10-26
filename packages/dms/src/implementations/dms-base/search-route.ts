import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Query,
  Validation,
} from "@antelopejs/interface-data-api/components";
import type { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type {
  Stream,
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GetEffectiveUserPermissions,
  HasAnyPermission,
} from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { SearchableMeta } from "@antelopejs/interface-dms/base";
import {
  DEFAULT_ROW_ID_FIELD,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { resolveFilterTokens } from "./filter-tokens";
import type { evaluateRowActionRule } from "../../utils";

type SearchRow = globalThis.Parameters<typeof evaluateRowActionRule>[1];

const MIN_SEARCH_LENGTH = 2;
const IDS_KEY = "ids";
const ID_KEY_KEY = "idKey";

type SearchCountResult = { total: number };

/** The controller the search runs against; the same for every field. */
interface SearchTarget {
  searchValue: string;
  context: RequestContext;
  meta: DataAPIMeta;
  thisObj: any;
}

type Condition = ValueProxyOrValue<boolean>;

type SearchFilter = NonNullable<DataAPIMeta["filters"][string]>;

/**
 * The filter matching a searchable field: the data-api filter a `filterable`
 * column (or `@Filter`) declared, else the filter of the field's column type.
 * Search is distinct from filtering, so a field need not be filterable to be
 * searched.
 */
function resolveSearchFilter(
  field: string,
  target: SearchTarget,
): SearchFilter | undefined {
  const declared = target.meta.filters[field];
  if (declared) {
    return declared;
  }
  const columnType = GetMetadata(target.thisObj.constructor, TableViewMeta)
    .columns[field]?.type;
  return columnType?.filter.bind(columnType);
}

function applySearchFilter(
  row: ValueProxy<SearchRow>,
  field: string,
  compareMode: string,
  target: SearchTarget,
): Condition {
  const { searchValue, context, meta, thisObj } = target;
  const filterFunc = resolveSearchFilter(field, target);

  if (!filterFunc) {
    return false;
  }

  const contextWithThis = Object.assign({}, context, { this: thisObj });
  const unlockedValue = Validation.UnlockRequest<SearchRow, string>(
    thisObj,
    meta,
    row,
    field,
  );
  return filterFunc(
    contextWithThis,
    unlockedValue,
    field,
    searchValue,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- SearchableMeta exposes arbitrary string modes while the filter owner accepts CompareMode; inference and Parameters<SearchFilter>[4] cannot establish that legacy registration invariant without rejecting modes.
    compareMode as globalThis.Parameters<SearchFilter>[4],
    row,
  );
}

function either(a: Condition, b: Condition): Condition {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Conditions combine literal booleans and database expression proxies; retain the literal short-circuit before calling proxy methods.
  if (typeof a === "boolean") return a ? true : b;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The right condition also has a literal boolean branch rather than a query proxy.
  if (typeof b === "boolean") return b ? true : a;
  return a.or(b);
}

function applyGlobalSearch(
  query: Stream<SearchRow>,
  searchableFields: Record<string, string>,
  target: SearchTarget,
): Stream<SearchRow> {
  const fieldEntries = Object.entries(searchableFields);

  if (fieldEntries.length === 0) {
    return query;
  }

  return query.filter((row: ValueProxy<SearchRow>) =>
    fieldEntries
      .map(([field, mode]) => applySearchFilter(row, field, mode, target))
      .reduce(either, false),
  );
}

function extractSearchParameter(reqCtx: RequestContext): string | undefined {
  if (reqCtx.url.searchParams.has("search")) {
    const searchValue = reqCtx.url.searchParams.get("search");
    if (!searchValue) {
      return undefined;
    }
    if (searchValue.length >= MIN_SEARCH_LENGTH) {
      return searchValue;
    }
  }
  return undefined;
}

async function computeEffectivePermissions(
  reqCtx: RequestContext,
  user: User | undefined,
  permissions: Set<string> | undefined,
): Promise<Set<string> | undefined> {
  if (permissions) {
    return permissions;
  }
  if (!user) {
    return undefined;
  }
  const tenantId = getRequestTenantId(reqCtx);
  const roleModel = GetModel(RoleModel, tenantId);
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const member = await memberModel.getByUser(user._id);
  const roleIds = member?.roleIds ?? [];
  return GetEffectiveUserPermissions(user, tenantId, roleIds, roleModel);
}

async function canViewArchived(
  thisObj: any,
  reqCtx: RequestContext,
  user: User | undefined,
  permissions: Set<string> | undefined,
): Promise<boolean> {
  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);

  const permissionIds = tableViewMeta.actionPermissionIds("viewArchived");
  if (permissionIds.length === 0) {
    return true;
  }
  const resolved = await computeEffectivePermissions(reqCtx, user, permissions);
  if (!resolved) {
    return false;
  }
  return HasAnyPermission(resolved, permissionIds);
}

/**
 * The filter tuple listing archived rows, or active ones. A row whose archive
 * field was never written (created before archive mode, or by a form that
 * leaves the field out) is active: it is matched as "not archived" rather
 * than "archived is false", which a missing field never equals.
 * @internal
 */
export function archiveFilter(
  archived: boolean,
): NonNullable<Parameters.ListParameters["filters"]>[string] {
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- FilterValue's owner declares string but archive filters intentionally send boolean true; inference and indexed access retain the mismatch, and converting the value would change database comparisons.
  return [true as unknown as string, archived ? "eq" : "ne"];
}

export async function applyArchiveFilter(
  thisObj: any,
  reqCtx: RequestContext,
  user: User | undefined,
  permissions: Set<string> | undefined,
  filters: Parameters.ListParameters["filters"],
): Promise<Parameters.ListParameters["filters"]> {
  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);
  const archiveField = tableViewMeta?.archiveField;
  if (!archiveField) {
    return filters;
  }

  const showArchived = reqCtx.url.searchParams.get("showArchived");
  const hasViewArchived = await canViewArchived(
    thisObj,
    reqCtx,
    user,
    permissions,
  );

  if (!hasViewArchived) {
    assert(
      showArchived !== "true",
      403,
      "Forbidden: cannot view archived rows",
    );
    return { ...filters, [archiveField]: archiveFilter(false) };
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The request adapter owns searchParams.get; retain its existing string check and unchanged fallback for absent or malformed archive parameters.
  if (typeof showArchived !== "string") {
    return filters;
  }

  return {
    ...filters,
    [archiveField]: archiveFilter(showArchived === "true"),
  };
}

/**
 * The field `ids` names rows by: `idKey` when the request names one the
 * listed rows carry — what a relation picker stores, its `keyMapping.value`
 * — else the table's row id key.
 */
function resolveIdsField(
  thisObj: any,
  reqCtx: RequestContext,
  pluck: Set<string> | undefined,
): string {
  const requested = reqCtx.url.searchParams.get(ID_KEY_KEY);
  if (requested && pluck?.has(requested)) return requested;
  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);
  return tableViewMeta?.options?.rowIdKey || DEFAULT_ROW_ID_FIELD;
}

/**
 * The rows a list answers narrowed to the `ids` the request names
 * (`?ids=a&ids=b`), so a relation field can label the ids it holds without
 * paging through every row. The filters, search, archive view and row rules
 * still apply: it only narrows what the caller may already read.
 */
function applyIdsRestriction(
  query: Stream<SearchRow>,
  ids: string[],
  field: string,
): Stream<SearchRow> {
  return query.filter((row: ValueProxy<SearchRow>) =>
    ids.map((id): Condition => row.key(field).eq(id)).reduce(either, false),
  );
}

export async function buildFilteredQuery(
  thisObj: any,
  reqCtx: RequestContext,
  params: Parameters.ListParameters,
  user?: User,
  permissions?: Set<string>,
) {
  const meta = GetDataControllerMeta(thisObj);
  const model = Query.GetModel(thisObj, meta);

  const filtersWithArchive = await applyArchiveFilter(
    thisObj,
    reqCtx,
    user,
    permissions,
    resolveFilterTokens(params?.filters, {
      userId: user?._id,
      now: new Date(),
    }),
  );

  const sort: globalThis.Parameters<typeof Query.List>[4] = params?.sortKey
    ? [params.sortKey, params.sortDirection]
    : undefined;

  let [query, queryTotal, deferredJoined] = Query.List(
    thisObj,
    meta,
    model.table,
    reqCtx,
    sort,
    filtersWithArchive,
    model.database,
  );

  const searchValue = extractSearchParameter(reqCtx);

  if (searchValue) {
    const searchableMeta = GetMetadata(thisObj.constructor, SearchableMeta);
    const searchableFields = searchableMeta?.getSearchableFields() || {};

    if (Object.keys(searchableFields).length > 0) {
      query = applyGlobalSearch(query, searchableFields, {
        searchValue,
        context: reqCtx,
        meta,
        thisObj,
      });
      queryTotal = query.count();
    }
  }

  return {
    meta,
    model,
    query,
    queryTotal,
    deferredJoined,
    filters: filtersWithArchive,
  };
}

export async function countWithSearch(
  thisObj: any,
  reqCtx: RequestContext,
  params: Parameters.ListParameters,
  user?: User,
  permissions?: Set<string>,
): Promise<SearchCountResult> {
  const { queryTotal } = await buildFilteredQuery(
    thisObj,
    reqCtx,
    params,
    user,
    permissions,
  );
  const total = await queryTotal;
  return { total };
}

export async function listWithSearch(
  thisObj: any,
  reqCtx: RequestContext,
  params: Parameters.ListParameters,
  user?: User,
  permissions?: Set<string>,
): Promise<{
  results: Awaited<ReturnType<typeof Query.ReadProperties>>[];
  total: number;
  offset: number;
  limit: number;
}> {
  const built = await buildFilteredQuery(
    thisObj,
    reqCtx,
    params,
    user,
    permissions,
  );
  const { meta, model, deferredJoined, filters } = built;
  let { query, queryTotal } = built;

  const pluck: Set<string> | undefined = meta.pluck[params.pluckMode ?? "list"];
  assert(
    params.noPluck || pluck,
    400,
    `No fields found for pluckMode '${params.pluckMode ?? "list"}'`,
  );

  const ids = reqCtx.url.searchParams.getAll(IDS_KEY);
  if (ids.length > 0) {
    query = applyIdsRestriction(
      query,
      ids,
      resolveIdsField(thisObj, reqCtx, pluck),
    );
    queryTotal = query.count();
  }

  const offset = params.offset || 0;
  const limit = params.limit || 10;
  const queryPaged = Query.ListPage(model.database, meta, query, {
    offset,
    limit,
    filters,
    sortKey: params.sortKey,
    pluck: params.noPluck ? undefined : pluck,
    noForeign: params.noForeign,
    deferredJoined,
  });

  const [dbResult, dbTotal] = await Promise.all([queryPaged, queryTotal]);

  const results = await Promise.all(
    dbResult.map((entry) => {
      const entryInstance = model.constructor.fromDatabase(entry);
      Validation.Unlock(thisObj, meta, entryInstance);
      return Query.ReadProperties(thisObj, meta, entryInstance);
    }),
  );

  Validation.ClearInternal(meta, results);

  return {
    results,
    total: dbTotal,
    offset,
    limit,
  };
}
