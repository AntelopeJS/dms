import { nextTick } from "vue";
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

const namesUrlFilter = (
  query: Record<string, unknown>,
  queryParamFilters: QueryParamFilters | undefined,
  isNamed: (param: string) => boolean,
): boolean =>
  Object.keys(queryParamFilters ?? {}).some(
    (param) => query[param] !== undefined && isNamed(param),
  );

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
  if (namesUrlFilter(query, arrival.queryParamFilters, () => true)) return true;
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

/** A visit to the page the table is already shown on. */
export interface TableLinkVisit {
  query: Record<string, unknown>;
  /** The query of the visit the table was last reached through. */
  previousQuery: Record<string, unknown>;
  urlScope: TableUrlScope;
  queryParamFilters: QueryParamFilters | undefined;
  /** The view and the tab the table shows. */
  activeView: string | undefined;
  activeTab: string;
  canOpenView: (id: string) => boolean;
  canOpenTab: (id: string) => boolean;
}

/**
 * Whether a visit that keeps the table mounted (a link to the page already
 * shown, back and forward) is a link to follow as an arrival would. The view
 * and the tab are written or kept in place, so they count when they differ
 * from what the table shows; a row and a URL filter when they differ from
 * the last visit. A visit repeating what the table already reads (the one
 * that mounted it, a page control rebuilding the query) is not a link.
 */
export function isLinkedVisit(visit: TableLinkVisit): boolean {
  const { query, previousQuery, urlScope } = visit;
  const read = (from: Record<string, unknown>, key: string) =>
    readTableUrlKey(from, urlScope, key).value;
  const view = read(query, VIEW_URL_KEY);
  if (view && view !== visit.activeView && visit.canOpenView(view)) {
    return true;
  }
  const tab = read(query, TAB_URL_KEY);
  if (tab && tab !== visit.activeTab && visit.canOpenTab(tab)) return true;
  const record = read(query, RECORD_URL_KEY);
  if (record && record !== read(previousQuery, RECORD_URL_KEY)) return true;
  return namesUrlFilter(
    query,
    visit.queryParamFilters,
    (param) => query[param] !== previousQuery[param],
  );
}

/** Preferences that can leave a followed link's listing state unkept. */
export interface LinkFollowingPreferences extends TablePreferences {
  /**
   * Runs `change`, which opens a link on the table already shown, without
   * keeping the listing state it sets: as on a linked arrival, the state
   * kept from before stays for the next plain visit.
   */
  followLink: (change: () => void) => Promise<void>;
}

/**
 * Wraps the table's preferences so a link followed in place does not
 * overwrite the kept listing state. The table keeps its state from
 * watchers, which run on the next flush: writes are held until it is done.
 */
export function linkFollowingPreferences(
  preferences: TablePreferences,
): LinkFollowingPreferences {
  let isFollowingLink = false;
  return {
    ...preferences,
    set: (field, value, defaultValue) => {
      if (isFollowingLink && LINKED_STATE_FIELDS.has(field)) return;
      preferences.set(field, value, defaultValue);
    },
    followLink: async (change) => {
      isFollowingLink = true;
      try {
        change();
        await nextTick();
      } finally {
        isFollowingLink = false;
      }
    },
  };
}
