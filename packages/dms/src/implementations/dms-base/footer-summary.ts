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
import {
  IsQueryValue,
  type QueryValue,
} from "@antelopejs/interface-database/common";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { rowRuleProblem } from "@antelopejs/interface-dms/base/table-view/internal/row-rule-shape";
import type { FooterSummaryValues } from "@antelopejs/interface-dms/base/table-view/internal/data-functions";
import type {
  TableViewFooterSummary,
  TableViewSummaryOperation,
  summarizeWithSearch as SummarizeDeclaration,
} from "@antelopejs/interface-dms/base/table-view";
import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import type { evaluateRowActionRule } from "../../utils";
import { buildFilteredQuery } from "./search-route";

type RuleRow = globalThis.Parameters<typeof evaluateRowActionRule>[1];
type SummaryReceiver = globalThis.Parameters<typeof SummarizeDeclaration>[0];
type Row = ValueProxy<RuleRow>;
type Condition = ValueProxyOrValue<boolean>;
type FieldReader = (field: string) => ValueProxy<unknown>;

const isLiteral = (condition: Condition): condition is boolean =>
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
  operands: readonly QueryValue[],
): Condition =>
  operands.map((operand): Condition => value.eq(operand)).reduce(either, false);

type FieldComparison = (
  value: ValueProxy<unknown>,
  operand: QueryValue,
) => Condition;

// SAFETY: compileRowRule rejects a rule whose dispatched in/notIn operand is no array (rowRuleProblem) before this table runs, so the operand is an array.
const FIELD_COMPARISONS = {
  equals: (value, operand) => value.eq(operand),
  notEquals: (value, operand) => value.ne(operand),
  in: (value, operands) => anyOf(value, operands as readonly QueryValue[]),
  notIn: (value, operands) =>
    negate(anyOf(value, operands as readonly QueryValue[])),
} satisfies Record<string, FieldComparison>;

type RuleCompiler = (
  rule: RowActionRule | RowActionRule[],
  read: FieldReader,
) => Condition;

// SAFETY: compileRowRule rejects a rule whose dispatched logical operand is no array of rules (and/or) or no rule (not) (rowRuleProblem) before this table runs.
const LOGICAL_COMPILERS = {
  and: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileChecked(rule, read))
      .reduce(both, true),
  or: (rules, read) =>
    (rules as RowActionRule[])
      .map((rule) => compileChecked(rule, read))
      .reduce(either, false),
  not: (rule, read) => negate(compileChecked(rule as RowActionRule, read)),
} satisfies Record<string, RuleCompiler>;

function compileChecked(rule: RowActionRule, read: FieldReader): Condition {
  const record: RuleRow = rule;
  const logical = Object.keys(LOGICAL_COMPILERS).find((key) => key in record);
  if (logical) {
    // SAFETY: Object.keys identifies a handler-table key and rowRuleProblem has checked its operand shape, array of rules for and/or and a rule for not.
    return LOGICAL_COMPILERS[logical as keyof typeof LOGICAL_COMPILERS](
      record[logical] as RowActionRule | RowActionRule[],
      read,
    );
  }
  const operator = Object.keys(FIELD_COMPARISONS).find((key) => key in record);
  if (!operator) return true;
  const operand = record[operator];
  if (!IsQueryValue(operand)) {
    throw new Error(`Malformed row rule: ${operator} must hold query values`);
  }
  // SAFETY: operator was selected from Object.keys of this same handler table.
  return FIELD_COMPARISONS[operator as keyof typeof FIELD_COMPARISONS](
    read(String(record.field)),
    operand,
  );
}

/**
 * A row rule as a database condition: the same grammar the row actions
 * evaluate in the browser (`equals`, `notEquals`, `in`, `notIn`, `and`, `or`,
 * `not`), on the row's stored fields. A rule whose operator operand has the
 * wrong shape, nested ones included, throws an `Error` naming it.
 */
export function compileRowRule(
  rule: RowActionRule,
  read: FieldReader,
): Condition {
  const problem = rowRuleProblem(rule);
  if (problem) throw new Error(`Malformed row rule: ${problem}`);
  return compileChecked(rule, read);
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
