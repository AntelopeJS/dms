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
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { SearchableMeta } from "@antelopejs/interface-dms/base";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";

const MIN_SEARCH_LENGTH = 2;

type SearchCountResult = { total: number };

/** The controller the search runs against; the same for every field. */
interface SearchTarget {
  searchValue: string;
  context: RequestContext;
  meta: DataAPIMeta;
  thisObj: any;
}

function applySearchFilter(
  row: ValueProxy<Record<string, unknown>>,
  field: string,
  compareMode: string,
  target: SearchTarget,
): ValueProxyOrValue<boolean> {
  const { searchValue, context, meta, thisObj } = target;
  const filterFunc = meta.filters[field];
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

function applyGlobalSearch(
  query: Stream<Record<string, unknown>>,
  searchableFields: Record<string, string>,
  target: SearchTarget,
): Stream<Record<string, unknown>> {
  const fieldEntries = Object.entries(searchableFields);

  if (fieldEntries.length === 0) {
    return query;
  }

  return query.filter((row: ValueProxy<Record<string, unknown>>) => {
    const [firstField, firstMode] = fieldEntries[0];
    let condition = applySearchFilter(row, firstField, firstMode, target);

    for (let i = 1; i < fieldEntries.length; i++) {
      const [field, mode] = fieldEntries[i];
      const nextCondition = applySearchFilter(row, field, mode, target);
      condition = (condition as any).or(nextCondition);
    }

    return condition;
  });
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
  const action = tableViewMeta?.componentBuilder?.getAction("viewArchived");
  const permissionId = action?.permissionId;
  if (!permissionId) {
    return true;
  }
  const resolved = await computeEffectivePermissions(reqCtx, user, permissions);
  if (!resolved) {
    return false;
  }
  return HasPermission(resolved, permissionId);
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
    return {
      ...filters,
      // The source and the target do not overlap, so this cannot be one
      // assertion: the value reaches here through a decorator, a JWT
      // payload or a filter tuple, none of which the type system sees.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions
      [archiveField]: [false as unknown as string, "eq"],
    };
  }

  if (typeof showArchived !== "string") {
    return filters;
  }

  return {
    ...filters,
    // The source and the target do not overlap, so this cannot be one
    // assertion: the value reaches here through a decorator, a JWT
    // payload or a filter tuple, none of which the type system sees.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    [archiveField]: [(showArchived === "true") as unknown as string, "eq"],
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
    params?.filters,
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
