import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { Validation } from "@antelopejs/interface-data-api/components";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type { FieldCondition } from "../../form-types";
import { fetchRowForGuard } from "../data-functions";
import type { ColumnOptions } from "../meta";
import { DEFAULT_ROW_ID_FIELD } from "../options";
import { getTableViewMetaFor } from "./meta";

type WriteMode = "new" | "edit";
type TableRow = NonNullable<Awaited<ReturnType<typeof fetchRowForGuard>>>;

/** Whether `row` meets `condition`: a field it lacks counts as empty. */
const meetsFieldCondition = (
  condition: FieldCondition,
  row: Readonly<TableRow>,
): boolean => condition.in.includes(row[condition.field] ?? null);

/** The columns whose form field `row` hides or disables. */
function inactiveColumns(
  columns: Readonly<Record<string, ColumnOptions>>,
  row: Readonly<TableRow>,
) {
  const entries = Object.entries(columns);
  return {
    hidden: entries
      .filter(
        ([, c]) => c.visibleWhen && !meetsFieldCondition(c.visibleWhen, row),
      )
      .map(([key]) => key),
    disabled: entries
      .filter(
        ([, c]) => c.disabledWhen && meetsFieldCondition(c.disabledWhen, row),
      )
      .map(([key]) => key),
  };
}

const isEmptyValue = (value: TableRow[string]): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * Applies the columns' conditions to the body of a `new` or `edit` before
 * `baseRoute` writes it, read on the row as it will be stored (an edit's
 * stored row under its body). The fields hidden or disabled leave the body,
 * and an edit clears the value a hidden field stored: a business turned
 * household keeps no VAT number. A disabled field keeps the one it holds.
 * `@Mandatory` binds a field with `visibleWhen` while it shows: there, an
 * edit must leave it filled, not only not clear it.
 *
 * @internal
 */
export const withColumnConditions = (
  baseRoute: DataControllerCallback,
  mode: WriteMode,
): DataControllerCallback => ({
  func: async function (
    this: Parameters<typeof fetchRowForGuard>[0] & {
      constructor: ConstructorParameters<typeof DataAPIMeta>[0];
    },
    ctx: RequestContext,
    params: Parameters<DataControllerCallback["func"]>[1],
    ...args: Parameters<DataControllerCallback["func"]>[2][]
  ) {
    const tableMeta = getTableViewMetaFor(this);
    const { columns } = tableMeta;
    const hasConditions = Object.values(columns).some(
      (c) => c.visibleWhen || c.disabledWhen,
    );
    if (!hasConditions) return baseRoute.func.call(this, ctx, params, ...args);

    const body = Validation.ParseBody(args[0]);
    let row: TableRow = body;
    let current: TableRow | undefined;
    if (mode === "edit") {
      current = await fetchRowForGuard(
        this,
        String(params.id),
        tableMeta.options.rowIdKey || DEFAULT_ROW_ID_FIELD,
      );
      throwHttpAssert(current, 404, "Not Found");
      row = { ...current, ...body };
    }

    const { hidden, disabled } = inactiveColumns(columns, row);
    const written = { ...body };
    for (const key of [...hidden, ...disabled]) delete written[key];
    for (const key of hidden) {
      if (current && !isEmptyValue(current[key])) written[key] = null;
    }

    if (params.noMandatory) {
      return baseRoute.func.call(this, ctx, params, written, ...args.slice(1));
    }
    const dataMeta = GetMetadata(this.constructor, DataAPIMeta);
    const conditional = Object.keys(columns).filter(
      (key) => columns[key].visibleWhen,
    );
    const exempt = new Set([...conditional, ...disabled]);
    Validation.MandatoryFields(
      Object.assign(Object.create(dataMeta), {
        fields: Object.fromEntries(
          Object.entries(dataMeta.fields).filter(([key]) => !exempt.has(key)),
        ),
      }),
      written,
      mode,
    );
    const missing = conditional.filter(
      (key) =>
        dataMeta.fields[key]?.mandatory?.has(mode) &&
        !hidden.includes(key) &&
        !disabled.includes(key) &&
        isEmptyValue(row[key]),
    );
    if (missing.length > 0) {
      throw new HTTPResult(400, {
        code: Validation.MISSING_MANDATORY_FIELDS,
        fields: missing,
      } satisfies Validation.FieldsErrorBody);
    }
    return baseRoute.func.call(
      this,
      ctx,
      { ...params, noMandatory: "true" },
      written,
      ...args.slice(1),
    );
  },
  args: baseRoute.args,
  method: baseRoute.method,
});
