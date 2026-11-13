import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerInstance,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
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
import { getTableViewMetaFor } from "@antelopejs/interface-dms/base/table-view/internal/meta";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { buildFilteredQuery } from "./search-route";
import { isSymbol } from "@antelopejs/interface-dms/utils/internal/type-check";

const IDS_KEY = "ids";
const HTTP_PAYLOAD_TOO_LARGE = 413;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isBulkRowSource(
  table: DataControllerInstance | BulkRowSource,
): table is BulkRowSource {
  return (
    typeof table === "object" &&
    table !== null &&
    "tableView" in table &&
    table.tableView instanceof TableViewMeta &&
    "model" in table &&
    typeof table.model === "object" &&
    table.model !== null
  );
}

function isControllerInstance(value: unknown): value is DataControllerInstance {
  return isObject(value);
}

/**
 * What the list query reads a source's rows through, in place of a data
 * controller: the controller's prototype, for its metadata and its methods,
 * and the source's model under the controller's model key. Any other
 * property, which the controller's own routes would have injected, throws
 * rather than reading as missing.
 */
function sourceReader({ model, tableView }: BulkRowSource) {
  const controller = tableView.target;
  const { modelKey } = GetMetadata(controller, DataAPIMeta, true);
  assert(modelKey, 500, `${controller.name} declares no model.`);
  const prototype: unknown = controller.prototype;
  assert(isObject(prototype), 500, `${controller.name} has no prototype.`);
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The proxy's get trap reads a controller property by a runtime string or symbol key, and the reader's prototype is the controller's, so no closed type describes its keys.
  const reader: Record<PropertyKey, unknown> = Object.defineProperty(
    { __proto__: prototype },
    modelKey,
    { value: model, enumerable: true },
  );
  return new Proxy(reader, {
    get(target, key) {
      if (isSymbol(key) || key in target) return target[key];
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
  table: DataControllerInstance | BulkRowSource,
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
  assert(isControllerInstance(thisObj), 500, "No data controller to read.");
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
    getTableViewMetaFor(thisObj).options.rowIdKey ?? DEFAULT_ROW_ID_FIELD;
  const matching = await rows
    .slice(0, MAX_BULK_MATCHING_ROWS + 1)
    .pluck(idField)
    .run();
  assert(
    matching.length <= MAX_BULK_MATCHING_ROWS,
    HTTP_PAYLOAD_TOO_LARGE,
    `More than ${MAX_BULK_MATCHING_ROWS} rows match: narrow the filters.`,
  );
  return matching.map((row) => String(row[idField]));
}
