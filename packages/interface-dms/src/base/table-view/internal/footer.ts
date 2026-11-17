import type { ControllerClass } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallbackWithOptions } from "@antelopejs/interface-data-api";
import { getDataTypeId } from "../../data-types";
import { FIELD_KEY } from "../../types/row-action-operators";
import type { RowActionRule } from "../../types/row-action";
import { TableViewMeta } from "../meta";
import { assertRowRule } from "./row-rule-shape";
import { servesRoute } from "./tabs";
import type {
  TableViewEmptyStateSerialized,
  TableViewEmptyStates,
  TableViewEmptyStatesSerialized,
  TableViewFooterOptions,
  TableViewFooterSerialized,
  TableViewFooterSummary,
  TableViewSummaryOperation,
} from "../options";

const LEGEND_TYPE_ID = "select";
const SUMMARY_OPERATIONS: readonly TableViewSummaryOperation[] = [
  "sum",
  "count",
];

/**
 * The columns a row rule reads, nested rules included.
 *
 * @internal
 */
export function ruleFields<T extends object>(rule: RowActionRule<T>): string[] {
  if (FIELD_KEY in rule) return [String(rule[FIELD_KEY])];
  return [
    ...operandRules("and" in rule ? rule.and : undefined),
    ...operandRules("or" in rule ? rule.or : undefined),
    ...operandRules("not" in rule ? rule.not : undefined),
  ].flatMap((entry) => ruleFields(entry));
}

function operandRules<T extends object>(
  operand: RowActionRule<T> | RowActionRule<T>[] | undefined,
): RowActionRule<T>[] {
  if (!operand) return [];
  return Array.isArray(operand) ? operand : [operand];
}

function checkedSummary<T extends object>(
  controllerName: string,
  meta: TableViewMeta,
  summary: TableViewFooterSummary<T>,
): TableViewFooterSummary {
  const { where, ...figure } = summary;
  const subject = `TableView footer summary "${figure.label}" on ${controllerName}`;
  if (!SUMMARY_OPERATIONS.includes(figure.op)) {
    throw new Error(
      `${subject} has op ${JSON.stringify(figure.op)}: give it ${SUMMARY_OPERATIONS.map((op) => `"${op}"`).join(" or ")}`,
    );
  }
  if (figure.op === "sum" && !figure.field) {
    throw new Error(`${subject} sums no field: give it a field`);
  }
  if (where) {
    assertRowRule(where, `${subject} has a malformed rule`, "where");
  }
  const fields = [
    ...(figure.field ? [figure.field] : []),
    ...(where ? ruleFields(where) : []),
  ];
  for (const field of fields) {
    if (!meta.columns[field]) {
      throw new Error(`${subject} references unknown column "${field}"`);
    }
  }
  return where ? { ...figure, where } : figure;
}

/**
 * The footer as it reaches the client: its summaries checked, recorded on
 * the controller and named by the id the `summary` route knows them by,
 * their `where` rule kept server-side. The legend must be a select column.
 *
 * @internal
 */
export function serializeFooter<T extends object>(
  controllerName: string,
  meta: TableViewMeta,
  footer: TableViewFooterOptions<T> | undefined,
): TableViewFooterSerialized | undefined {
  if (!footer) return undefined;
  const { summary, ...texts } = footer;
  const legendColumn = footer.legend ? meta.columns[footer.legend] : undefined;
  if (
    footer.legend &&
    (!legendColumn || getDataTypeId(legendColumn.type) !== LEGEND_TYPE_ID)
  ) {
    throw new Error(
      `TableView footer legend on ${controllerName} must name a SelectType column (got "${footer.legend}")`,
    );
  }
  if (!summary) return texts;
  const checked = summary.map((entry) =>
    checkedSummary(controllerName, meta, entry),
  );
  const ids = meta.registerFooterSummaries(checked);
  return {
    ...texts,
    summary: checked.map(({ where: _where, ...entry }, index) => ({
      ...entry,
      id: ids[index],
    })),
  };
}

/**
 * The empty states as they reach the client, components serialized.
 *
 * @internal
 */
export function serializeEmptyStates(
  emptyStates: TableViewEmptyStates | undefined,
): TableViewEmptyStatesSerialized | undefined {
  if (!emptyStates) return undefined;
  return Object.fromEntries(
    Object.entries({ ...emptyStates }).map(
      ([kind, state]): [string, TableViewEmptyStateSerialized | undefined] => [
        kind,
        state && {
          ...state,
          component: state.component?.serializeSync(),
        },
      ],
    ),
  );
}

const SUMMARY_PATH = "summary";
const SUMMARY_METHOD = "get";
const controllersWarnedForSummaries = new WeakSet<ControllerClass>();

/**
 * Warn, once per controller, when a table view declares footer summaries but
 * its controller mounts no `GET summary` route: the footer could not read
 * them. The fix belongs in the controller (`summary: TableViewRoutes.Summary`).
 *
 * @internal
 */
export function warnIfSummaryLacksRoute<T extends object>(
  controller: ControllerClass,
  location: string,
  footer: TableViewFooterOptions<T> | undefined,
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): void {
  if (!footer?.summary?.length) return;
  if (controllersWarnedForSummaries.has(controller)) return;
  if (servesRoute(endpoints, SUMMARY_PATH, SUMMARY_METHOD)) return;
  controllersWarnedForSummaries.add(controller);
  Logging.Warn(
    `[DMS] TableView on "${controller.name}" (${location}) declares footer summaries but its controller mounts no GET ${location}/${SUMMARY_PATH} route: they will not show. Mount \`summary: TableViewRoutes.Summary\` on the controller.`,
  );
}
