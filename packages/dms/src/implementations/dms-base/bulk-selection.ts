import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  authorizeAction,
  BULK_ALL_MATCHING_KEY,
  DEFAULT_ROW_ID_FIELD,
  MAX_BULK_MATCHING_ROWS,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { LIST_ACTION } from "@antelopejs/interface-dms/base/table-view/auth";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { buildFilteredQuery } from "./search-route";

const IDS_KEY = "ids";
const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * The rows a bulk custom action runs on: the selected ids, or every row the
 * table's filters, search and archive view match, read like the list reads
 * them. Either way the caller needs the table's `list` permission: a caller
 * who cannot see the rows does not pick them by id either.
 */
export async function resolveBulkRowIds(
  thisObj: unknown,
  ctx: RequestContext,
  user: User,
): Promise<string[]> {
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
