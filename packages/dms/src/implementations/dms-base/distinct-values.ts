import type { RequestContext } from "@antelopejs/interface-api";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { distinctWithSearch as DistinctDeclaration } from "@antelopejs/interface-dms/base/table-view";
import {
  type ColumnValues,
  MAX_COLUMN_VALUES,
} from "@antelopejs/interface-dms/base/table-view/internal/data-functions";
import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";
import { buildFilteredQuery, resolveListScope } from "./search-route";

type DistinctReceiver = globalThis.Parameters<typeof DistinctDeclaration>[0];

/**
 * The distinct values of each column the controller lists, over every row
 * its list route reads for the request: its filters, the caller's archive
 * view and the request's search included. A column the list leaves out is
 * not read.
 */
export async function distinctWithSearch(
  thisObj: DistinctReceiver,
  reqCtx: RequestContext,
  columns: string[],
  user?: User,
  permissions?: Set<string>,
): Promise<ColumnValues[]> {
  const meta = GetDataControllerMeta(thisObj);
  const listed: Set<string> | undefined = meta.pluck.list;
  const params = { filters: Parameters.ExtractFilters(reqCtx, meta) };
  const { query } = buildFilteredQuery(
    await resolveListScope(thisObj, reqCtx, params, user, permissions),
  );
  return Promise.all(
    columns
      .filter((column) => listed?.has(column))
      .map(async (column) => {
        const values = await query
          .distinct(column)
          .slice(0, MAX_COLUMN_VALUES + 1)
          .run();
        return {
          column,
          values: values.filter(isString),
          complete: values.length <= MAX_COLUMN_VALUES,
        };
      }),
  );
}
