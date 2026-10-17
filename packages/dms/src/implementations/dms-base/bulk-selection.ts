import {
  computeParameter,
  type ControllerClass,
  ControllerMeta,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  authorizeAction,
  LIST_ACTION,
} from "@antelopejs/interface-dms/base/table-view/internal/auth";
import {
  BULK_ALL_MATCHING_KEY,
  DEFAULT_ROW_ID_FIELD,
  MAX_BULK_MATCHING_ROWS,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { buildFilteredQuery } from "./search-route";

const IDS_KEY = "ids";
const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * The data controller a bulk selection is read through. A route outside it
 * (a page's, another controller's) names it by its class: the rows are then
 * read on an instance holding the model the controller's own routes get for
 * this request (its tenant's).
 */
async function bulkController(
  target: unknown,
  ctx: RequestContext,
): Promise<object> {
  if (typeof target !== "function") return target as object;
  const controllerClass = target as ControllerClass;
  const instance = Object.create(controllerClass.prototype) as Record<
    string,
    unknown
  >;
  const { modelKey } = GetDataControllerMeta(instance);
  const provider = modelKey
    ? GetMetadata(controllerClass, ControllerMeta).computed_props[modelKey]
    : undefined;
  if (modelKey && provider) {
    instance[modelKey] = await computeParameter(ctx, provider, instance);
  }
  return instance;
}

/**
 * The rows a bulk custom action runs on: the selected ids, or every row the
 * table's filters, search and archive view match, read like the list reads
 * them. Either way the caller needs the table's `list` permission: a caller
 * who cannot see the rows does not pick them by id either.
 */
export async function resolveBulkRowIds(
  target: unknown,
  ctx: RequestContext,
  user: User,
): Promise<string[]> {
  const thisObj = await bulkController(target, ctx);
  const permissions = await authorizeAction(
    thisObj,
    LIST_ACTION,
    user,
    getRequestTenantId(ctx),
  );
  const query = ctx.url.searchParams;
  if (query.get(BULK_ALL_MATCHING_KEY) !== "true") return query.getAll(IDS_KEY);
  const filters = Parameters.ExtractFilters(
    ctx,
    GetDataControllerMeta(thisObj),
  );
  const { query: rows } = await buildFilteredQuery(
    thisObj,
    ctx,
    { filters },
    user,
    permissions,
  );
  const idField =
    GetMetadata(
      (thisObj as { constructor: new () => unknown }).constructor,
      TableViewMeta,
    ).options.rowIdKey ?? DEFAULT_ROW_ID_FIELD;
  const matching = (await rows
    .slice(0, MAX_BULK_MATCHING_ROWS + 1)
    .pluck(idField)) as Record<string, unknown>[];
  assert(
    matching.length <= MAX_BULK_MATCHING_ROWS,
    HTTP_PAYLOAD_TOO_LARGE,
    `More than ${MAX_BULK_MATCHING_ROWS} rows match: narrow the filters.`,
  );
  return matching.map((row) => String(row[idField]));
}
