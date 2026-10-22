import type { RequestContext } from "@antelopejs/interface-api";
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
  type BulkRowSource,
  DEFAULT_ROW_ID_FIELD,
  MAX_BULK_MATCHING_ROWS,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { buildFilteredQuery } from "./search-route";

const IDS_KEY = "ids";
const HTTP_PAYLOAD_TOO_LARGE = 413;

function isBulkRowSource(table: unknown): table is BulkRowSource {
  return (
    typeof table === "object" &&
    table !== null &&
    "tableView" in table &&
    "model" in table
  );
}

/** A data controller as the list query reads it: its properties by key. */
type ControllerReader = Record<PropertyKey, unknown>;

/**
 * What the list query reads a source's rows through, in place of a data
 * controller: the controller's prototype, for its metadata and its methods,
 * and the source's model under the controller's model key. Any other
 * property, which the controller's own routes would have injected, throws
 * rather than reading as missing.
 */
function sourceReader({ model, tableView }: BulkRowSource): ControllerReader {
  const controller = tableView.target;
  const { modelKey } = GetDataControllerMeta(
    Object.create(controller.prototype as object),
  );
  assert(modelKey, 500, `${controller.name} declares no model.`);
  const reader = Object.create(controller.prototype as object, {
    [modelKey]: { value: model, enumerable: true },
  }) as ControllerReader;
  return new Proxy(reader, {
    get(target, key) {
      if (typeof key === "symbol" || key in target) return target[key];
      throw new Error(
        `resolveBulkRowIds read "${key}" of ${controller.name}, which a BulkRowSource does not carry: resolve the selection from a route of ${controller.name}, with this.`,
      );
    },
  });
}

/**
 * The rows a bulk custom action runs on: the selected ids, or every row the
 * table's filters, search and archive view match, read like the list reads
 * them. Either way the caller needs the table's `list` permission: a caller
 * who cannot see the rows does not pick them by id either.
 */
export async function resolveBulkRowIds(
  table: unknown,
  ctx: RequestContext,
  user: User,
): Promise<string[]> {
  const thisObj = isBulkRowSource(table) ? sourceReader(table) : table;
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
