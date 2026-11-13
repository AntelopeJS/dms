import type { RequestContext } from "@antelopejs/interface-api";
import { GetDataControllerMeta } from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import type {
  DataAPIMeta,
  RowFields,
} from "@antelopejs/interface-data-api/metadata";
import type {
  Datum,
  Stream,
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { assertRowRule } from "@antelopejs/interface-dms/base/table-view/internal/row-rule-shape";
import type { FooterSummaryValues } from "@antelopejs/interface-dms/base/table-view/internal/data-functions";
import type {
  TableViewFooterSummary,
  TableViewSummaryOperation,
  summarizeWithSearch as SummarizeDeclaration,
} from "@antelopejs/interface-dms/base/table-view";
import type { RowActionRule } from "@antelopejs/interface-dms/base/types/row-action";
import { isRuleOperand, type RuleOperand } from "./row-rule-operand";
import { buildFilteredQuery } from "./search-route";

type SummaryReceiver = globalThis.Parameters<typeof SummarizeDeclaration>[0];
type Row = ValueProxy<RowFields>;
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
  operands: readonly RuleOperand[],
): Condition =>
  operands.map((operand): Condition => value.eq(operand)).reduce(either, false);

const isOperandList = (value: unknown[]): value is RuleOperand[] =>
  isRuleOperand(value);

const plainValuesError = (operator: string): Error =>
  new Error(`Malformed row rule: ${operator} must hold plain values`);

function compileLogical(
  rule: RowActionRule,
  read: FieldReader,
): Condition | undefined {
  if (Object.hasOwn(rule, "and") && "and" in rule) {
    return rule.and
      .map((child) => compileChecked(child, read))
      .reduce(both, true);
  }
  if (Object.hasOwn(rule, "or") && "or" in rule) {
    return rule.or
      .map((child) => compileChecked(child, read))
      .reduce(either, false);
  }
  if (Object.hasOwn(rule, "not") && "not" in rule) {
    return negate(compileChecked(rule.not, read));
  }
  return undefined;
}

function compileComparison(rule: RowActionRule, read: FieldReader): Condition {
  if (Object.hasOwn(rule, "equals") && "equals" in rule) {
    if (!isRuleOperand(rule.equals)) throw plainValuesError("equals");
    return read(String(rule.field)).eq(rule.equals);
  }
  if (Object.hasOwn(rule, "notEquals") && "notEquals" in rule) {
    if (!isRuleOperand(rule.notEquals)) throw plainValuesError("notEquals");
    return read(String(rule.field)).ne(rule.notEquals);
  }
  if (Object.hasOwn(rule, "in") && "in" in rule) {
    if (!isOperandList(rule.in)) throw plainValuesError("in");
    return anyOf(read(String(rule.field)), rule.in);
  }
  if (Object.hasOwn(rule, "notIn") && "notIn" in rule) {
    if (!isOperandList(rule.notIn)) throw plainValuesError("notIn");
    return negate(anyOf(read(String(rule.field)), rule.notIn));
  }
  return true;
}

function compileChecked(rule: RowActionRule, read: FieldReader): Condition {
  return compileLogical(rule, read) ?? compileComparison(rule, read);
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
  assertRowRule(rule, "Malformed row rule");
  return compileChecked(rule, read);
}

type SummaryReader = (
  rows: Stream<RowFields>,
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
    Validation.UnlockRequest<RowFields, string>(thisObj, meta, row, field);
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
