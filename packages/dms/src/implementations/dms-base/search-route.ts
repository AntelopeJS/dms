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
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { resolveFilterTokens } from "./filter-tokens";

const MIN_SEARCH_LENGTH = 2;

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
  row: ValueProxy<Record<string, unknown>>,
  field: string,
  compareMode: string,
  target: SearchTarget,
): Condition {
  const { searchValue, context, meta, thisObj } = target;
  const filterFunc = resolveSearchFilter(field, target);
  // A field with neither a filter nor a column cannot be matched.
  if (!filterFunc) {
    return false;
  }

  const contextWithThis = Object.assign({}, context, { this: thisObj });
  const unlockedValue = Validation.UnlockRequest<
    Record<string, unknown>,
    string
  >(thisObj, meta, row, field);
  return filterFunc(
    contextWithThis,
    unlockedValue,
    field,
    searchValue,
    compareMode as any,
    row,
  );
}

// A filter may answer with a literal (an unknown compare mode does): it is
// folded away rather than asked for an operator it does not have.
function either(a: Condition, b: Condition): Condition {
  if (typeof a === "boolean") return a ? true : b;
  if (typeof b === "boolean") return b ? true : a;
  return a.or(b);
}

function applyGlobalSearch(
  query: Stream<Record<string, unknown>>,
  searchableFields: Record<string, string>,
  target: SearchTarget,
): Stream<Record<string, unknown>> {
  const fieldEntries = Object.entries(searchableFields);

  if (fieldEntries.length === 0) {
    return query;
  }

  return query.filter((row: ValueProxy<Record<string, unknown>>) =>
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
  // Every table view mounting the controller guards its archived rows with
  // its own permission: holding it on any of them lets the archive show.
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
 */
// @internal
export function archiveFilter(
  archived: boolean,
): NonNullable<Parameters.ListParameters["filters"]>[string] {
  // The source and the target do not overlap, so this cannot be one
  // assertion: the value reaches here through a decorator, a JWT payload or
  // a filter tuple, none of which the type system sees.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
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

  if (typeof showArchived !== "string") {
    return filters;
  }

  return {
    ...filters,
    [archiveField]: archiveFilter(showArchived === "true"),
  };
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

  const sort = params?.sortKey
    ? ([params.sortKey, params.sortDirection] as [
        string,
        "asc" | "desc" | undefined,
      ])
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

  return { meta, model, query, queryTotal, deferredJoined };
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
  results: Record<string, any>[];
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
  const { meta, model, queryTotal, deferredJoined } = built;
  let query = built.query;

  const pluck: Set<string> | undefined = meta.pluck[params.pluckMode ?? "list"];
  assert(
    params.noPluck || pluck,
    400,
    `No fields found for pluckMode '${params.pluckMode ?? "list"}'`,
  );

  if (!params.noForeign) {
    query = Query.Foreign(
      model.database,
      meta,
      query as any,
      params.noPluck ? undefined : pluck,
    );
  }

  const offset = params.offset || 0;
  const limit = params.limit || 10;
  let queryPaged = query.slice(offset, limit);

  const joinedFields = new Set(
    [...deferredJoined].filter((field) => params.noPluck || pluck?.has(field)),
  );
  if (joinedFields.size > 0) {
    queryPaged = Query.Joined(
      model.database,
      meta,
      queryPaged as any,
      joinedFields,
    );
  }

  if (!params.noPluck && pluck) {
    queryPaged = queryPaged.pluck("_internal", ...pluck);
  }

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
