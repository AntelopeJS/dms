import type { RequestContext } from "@antelopejs/interface-api";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import type { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type {
  Datum,
  Stream,
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { FooterSummaryValues } from "@antelopejs/interface-dms/base/table-view/internal/data-functions";
import type {
  TableViewFooterSummary,
  TableViewSummaryOperation,
} from "@antelopejs/interface-dms/base/table-view";
import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import { buildFilteredQuery } from "./search-route";

type Row = ValueProxy<Record<string, unknown>>;
type Condition = ValueProxyOrValue<boolean>;
type FieldReader = (field: string) => ValueProxy<unknown>;

const isLiteral = (condition: Condition): condition is boolean =>
  typeof condition === "boolean";

// Rules combine in the database: a literal is folded away rather than asked
// for an operator it does not have.
function both(a: Condition, b: Condition): Condition {
  if (isLiteral(a)) return a ? b : false;
  if (isLiteral(b)) return b ? a : false;
  return a.and(b);
}

function either(a: Condition, b: Condition): Condition {
  if (isLiteral(a)) return a ? true : b;
  if (isLiteral(b)) return b ? true : a;
  return a.or(b);
}

function negate(condition: Condition): Condition {
  return isLiteral(condition) ? !condition : condition.not();
}

const anyOf = (value: ValueProxy<unknown>, operands: unknown[]): Condition =>
  operands
    .map((operand) => value.eq(operand) as Condition)
    .reduce(either, false);

type FieldComparison = (
  value: ValueProxy<unknown>,
  operand: unknown,
) => Condition;

const FIELD_COMPARISONS: Record<string, FieldComparison> = {
  equals: (value, operand) => value.eq(operand),
  notEquals: (value, operand) => value.ne(operand),
  in: (value, operands) => anyOf(value, operands as unknown[]),
  notIn: (value, operands) => negate(anyOf(value, operands as unknown[])),
};

type RuleCompiler = (rule: unknown, read: FieldReader) => Condition;

const LOGICAL_COMPILERS: Record<string, RuleCompiler> = {
  and: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileRowRule(rule, read))
      .reduce(both, true),
  or: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileRowRule(rule, read))
      .reduce(either, false),
  not: (rule, read) => negate(compileRowRule(rule as RowActionRule, read)),
};

/**
 * A row rule as a database condition: the same grammar the row actions
 * evaluate in the browser (`equals`, `notEquals`, `in`, `notIn`, `and`, `or`,
 * `not`), on the row's stored fields.
 */
export function compileRowRule(
  rule: RowActionRule,
  read: FieldReader,
): Condition {
  const record = rule as Record<string, unknown>;
  const logical = Object.keys(LOGICAL_COMPILERS).find((key) => key in record);
  if (logical) return LOGICAL_COMPILERS[logical]!(record[logical], read);
  const operator = Object.keys(FIELD_COMPARISONS).find((key) => key in record);
  if (!operator) return true;
  return FIELD_COMPARISONS[operator]!(
    read(String(record.field)),
    record[operator],
  );
}

type SummaryReader = (
  rows: Stream<Record<string, unknown>>,
  field: string | undefined,
) => Datum<number>;

const SUMMARY_OPERATIONS: Record<TableViewSummaryOperation, SummaryReader> = {
  count: (rows) => rows.count(),
  sum: (rows, field) => rows.sum(field),
};

function fieldReader(
  thisObj: unknown,
  meta: DataAPIMeta,
  row: Row,
): FieldReader {
  return (field) =>
    Validation.UnlockRequest<Record<string, unknown>, string>(
      thisObj,
      meta,
      row,
      field,
    ) as ValueProxy<unknown>;
}

/**
 * The footer summaries over every row the request's filters, search and
 * archive view list, each narrowed by its own `where` rule.
 */
// A published contract: the runtime receives the interface's arguments
// positionally.
// oxlint-disable-next-line eslint/max-params
export async function summarizeWithSearch(
  thisObj: unknown,
  reqCtx: RequestContext,
  params: Parameters.ListParameters,
  summaries: Record<string, TableViewFooterSummary>,
  user?: User,
  permissions?: Set<string>,
): Promise<FooterSummaryValues> {
  const { query } = await buildFilteredQuery(
    thisObj,
    reqCtx,
    params,
    user,
    permissions,
  );
  const meta = GetDataControllerMeta(thisObj);
  const entries = await Promise.all(
    Object.entries(summaries).map(async ([id, summary]) => {
      const { where } = summary;
      const rows = where
        ? query.filter((row: Row) =>
            compileRowRule(where, fieldReader(thisObj, meta, row)),
          )
        : query;
      const value = await SUMMARY_OPERATIONS[summary.op](rows, summary.field);
      return [id, Number(value) || 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}
