// The footer band and the empty states of a table view: the figures the
// `summary` route computes over the listed rows, the legend, and what an
// empty body says.

import type { ControllerClass } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallbackWithOptions } from "@antelopejs/interface-data-api";
import { getDataTypeId } from "../data-types";
import {
  FIELD_KEY,
  LOGICAL_OPERATOR_KEYS,
} from "../types/row-action-operators";
import type { RowActionRule } from "../types/row-action";
import { TableViewMeta } from "./meta";
import { servesRoute } from "./tabs";
import type {
  TableViewEmptyStates,
  TableViewEmptyStatesSerialized,
  TableViewFooterOptions,
  TableViewFooterSerialized,
  TableViewFooterSummary,
} from "./options";

const LEGEND_TYPE_ID = "select";

/** The columns a row rule reads, nested rules included. */
export function ruleFields<T extends Record<string, unknown>>(
  rule: RowActionRule<T>,
): string[] {
  const record = rule as Record<string, unknown>;
  if (FIELD_KEY in record) return [String(record[FIELD_KEY])];
  return LOGICAL_OPERATOR_KEYS.flatMap((key) => {
    const nested = record[key];
    if (!nested) return [];
    const rules = Array.isArray(nested) ? nested : [nested];
    return rules.flatMap((entry) => ruleFields(entry as RowActionRule));
  });
}

function assertSummary<T extends Record<string, unknown>>(
  controllerName: string,
  meta: TableViewMeta,
  summary: TableViewFooterSummary<T>,
): void {
  const where = `TableView footer summary "${summary.label}" on ${controllerName}`;
  if (summary.op === "sum" && !summary.field) {
    throw new Error(`${where} sums no field: give it a field`);
  }
  const fields = [
    ...(summary.field ? [summary.field] : []),
    ...(summary.where ? ruleFields(summary.where) : []),
  ];
  for (const field of fields) {
    if (!meta.columns[field]) {
      throw new Error(`${where} references unknown column "${field}"`);
    }
  }
}

/**
 * The footer as it reaches the client: its summaries checked, recorded on
 * the controller and named by the id the `summary` route knows them by,
 * their `where` rule kept server-side. The legend must be a select column.
 */
export function serializeFooter<T extends Record<string, unknown>>(
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
  for (const entry of summary) assertSummary(controllerName, meta, entry);
  const ids = meta.registerFooterSummaries(summary);
  return {
    ...texts,
    summary: summary.map(({ where: _where, ...entry }, index) => ({
      ...entry,
      id: ids[index]!,
    })),
  };
}

/** The empty states as they reach the client, components serialized. */
export function serializeEmptyStates(
  emptyStates: TableViewEmptyStates | undefined,
): TableViewEmptyStatesSerialized | undefined {
  if (!emptyStates) return undefined;
  return Object.fromEntries(
    Object.entries(emptyStates).map(([kind, state]) => [
      kind,
      state && {
        ...state,
        component: state.component?.serializeSync(),
      },
    ]),
  );
}

const SUMMARY_PATH = "summary";
const SUMMARY_METHOD = "get";
const controllersWarnedForSummaries = new WeakSet<ControllerClass>();

/**
 * Warn, once per controller, when a table view declares footer summaries but
 * its controller mounts no `GET summary` route: the footer could not read
 * them. The fix belongs in the controller (`summary: TableViewRoutes.Summary`).
 */
export function warnIfSummaryLacksRoute<T extends Record<string, unknown>>(
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
