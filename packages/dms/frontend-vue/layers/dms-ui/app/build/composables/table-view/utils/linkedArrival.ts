import type { TableField } from "#dms-core/app/build/composables/user/tablePreferences";
import type { QueryParamFilters } from "../../../../composables/table-view/types/config";
import type { TablePreferences } from "../useTablePreferences";
import { RECORD_URL_KEY } from "./recordLink";
import { readTableUrlKey, type TableUrlScope } from "./views";

/**
 * The kept fields that decide which rows a table lists: a link that names
 * part of that state replaces all of it, not only what it names.
 */
const LINKED_STATE_FIELDS: ReadonlySet<TableField> = new Set<TableField>([
  "activeView",
  "activeTab",
  "columnFilters",
  "sorting",
  "pagination",
  "paginationScope",
]);

const VIEW_URL_KEY = "view";
const TAB_URL_KEY = "tab";

/** What the URL a table arrives on may name. */
export interface TableLinkArrival {
  query: Record<string, unknown>;
  urlScope: TableUrlScope;
  queryParamFilters: QueryParamFilters | undefined;
  /** The tab kept from the last visit. */
  rememberedTab: string;
}

/**
 * Whether the table was reached through a link that names what it lists: a
 * view, a record, a filter declared in `queryParamFilters`, or a tab. A tab
 * the user left open is written in the URL and kept from the last visit
 * alike, so a reload naming the kept tab is not a link.
 */
export function isLinkedArrival(arrival: TableLinkArrival): boolean {
  const { query, urlScope } = arrival;
  const names = (key: string) => !!readTableUrlKey(query, urlScope, key).value;
  if (names(VIEW_URL_KEY) || names(RECORD_URL_KEY)) return true;
  const isFilteredByUrl = Object.keys(arrival.queryParamFilters ?? {}).some(
    (param) => query[param] !== undefined,
  );
  if (isFilteredByUrl) return true;
  const tab = readTableUrlKey(query, urlScope, TAB_URL_KEY).value;
  return tab !== undefined && tab !== arrival.rememberedTab;
}

/**
 * The table's preferences as a link arrival reads them: the listing state
 * (`LINKED_STATE_FIELDS`) reads as its defaults, so the link applies over
 * the table's own default state rather than over the last visit's. Writes
 * go through: what the user changes from there is kept as usual, and what
 * they do not change stays kept for their next plain visit.
 */
export function linkedArrivalPreferences(
  preferences: TablePreferences,
): TablePreferences {
  return {
    ...preferences,
    get: (field, defaultValue) =>
      LINKED_STATE_FIELDS.has(field)
        ? defaultValue
        : preferences.get(field, defaultValue),
  };
}
