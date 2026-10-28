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
  summarizeWithSearch as SummarizeDeclaration,
} from "@antelopejs/interface-dms/base/table-view";
import type {
  FieldEqualsRule,
  FieldInRule,
  RowActionRule,
} from "@antelopejs/interface-dms/base/types/row-action";
import type { evaluateRowActionRule } from "../../utils";
import { buildFilteredQuery } from "./search-route";

type RuleRow = globalThis.Parameters<typeof evaluateRowActionRule>[1];
type SummaryReceiver = globalThis.Parameters<typeof SummarizeDeclaration>[0];
type Row = ValueProxy<RuleRow>;
type Condition = ValueProxyOrValue<boolean>;
type FieldReader = (field: string) => ValueProxy<unknown>;

const isLiteral = (condition: Condition): condition is boolean =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Database conditions are either literal booleans or query proxies; retain the existing distinction before invoking proxy operators.
  typeof condition === "boolean";

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

const anyOf = (
  value: ValueProxy<unknown>,
  operands: FieldInRule["in"],
): Condition =>
  operands.map((operand): Condition => value.eq(operand)).reduce(either, false);

type FieldComparison = (
  value: ValueProxy<unknown>,
  operand: FieldEqualsRule["equals"],
) => Condition;

// SAFETY: This unchecked boundary treats in/notIn operands as arrays. First-present-key dispatch does not validate their shape; malformed mixed-key inputs can throw TypeError.
const FIELD_COMPARISONS = {
  equals: (value, operand) => value.eq(operand),
  notEquals: (value, operand) => value.ne(operand),
  in: (value, operands) => anyOf(value, operands as FieldInRule["in"]),
  notIn: (value, operands) =>
    negate(anyOf(value, operands as FieldInRule["in"])),
} satisfies Record<string, FieldComparison>;

type RuleCompiler = (
  rule: RowActionRule | RowActionRule[],
  read: FieldReader,
) => Condition;

// SAFETY: Logical operands are unchecked. These assertions assume and/or arrays and a single not rule; dispatch does not establish those shapes, and malformed operands can throw TypeError.
const LOGICAL_COMPILERS = {
  and: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileRowRule(rule, read))
      .reduce(both, true),
  or: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileRowRule(rule, read))
      .reduce(either, false),
  not: (rule, read) => negate(compileRowRule(rule as RowActionRule, read)),
} satisfies Record<string, RuleCompiler>;

/**
 * A row rule as a database condition: the same grammar the row actions
 * evaluate in the browser (`equals`, `notEquals`, `in`, `notIn`, `and`, `or`,
 * `not`), on the row's stored fields.
 */
export function compileRowRule(
  rule: RowActionRule,
  read: FieldReader,
): Condition {
  const record: RuleRow = rule;
  const logical = Object.keys(LOGICAL_COMPILERS).find((key) => key in record);
  if (logical) {
    // SAFETY: Object.keys identifies a handler-table key, but its operand remains unchecked. The rule/array assertion trusts caller input; malformed mixed-key operands can throw TypeError.
    return LOGICAL_COMPILERS[logical as keyof typeof LOGICAL_COMPILERS](
      record[logical] as RowActionRule | RowActionRule[],
      read,
    );
  }
  const operator = Object.keys(FIELD_COMPARISONS).find((key) => key in record);
  if (!operator) return true;
  // SAFETY: operator was selected from Object.keys of this same handler table.
  return FIELD_COMPARISONS[operator as keyof typeof FIELD_COMPARISONS](
    read(String(record.field)),
    record[operator],
  );
}

type SummaryReader = (
  rows: Stream<RuleRow>,
  field: string | undefined,
) => Datum<number>;

const SUMMARY_OPERATIONS: Record<TableViewSummaryOperation, SummaryReader> = {
  count: (rows) => rows.count(),
  sum: (rows, field) => rows.sum(field),
};

function fieldReader(
  thisObj: SummaryReceiver,
  meta: DataAPIMeta,
  row: Row,
): FieldReader {
  return (field) =>
    Validation.UnlockRequest<RuleRow, string>(thisObj, meta, row, field);
}

/**
 * The footer summaries over every row the request's filters, search and
 * archive view list, each narrowed by its own `where` rule.
 */

// oxlint-disable-next-line eslint/max-params -- The interface invokes this implementation positionally with receiver, request, filters, summaries, user and permission arguments.
export async function summarizeWithSearch(
  thisObj: SummaryReceiver,
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
