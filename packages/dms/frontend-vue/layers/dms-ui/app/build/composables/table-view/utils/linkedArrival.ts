import { nextTick } from "vue";
import {
  hashText,
  type TableField,
} from "#dms-core/app/build/composables/user/tablePreferences";
import type { QueryParamFilters } from "../../../../composables/table-view/types/config";
import type { TablePreferences } from "../useTablePreferences";
import { RECORD_URL_KEY } from "./recordLink";
import { readTableUrlKey, type TableUrlScope, writeTableUrlKey } from "./views";

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

/**
 * The listing choices a user makes on a link's table (a view, a tab, a
 * filter, a sort): the first one makes the state shown their own.
 */
const USER_CHOICE_FIELDS: ReadonlySet<TableField> = new Set<TableField>([
  "activeView",
  "activeTab",
  "columnFilters",
  "sorting",
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
  /** The URL filters the kept state was chosen under (`urlFilterScope`). */
  keptLinkScope: string | undefined;
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
 * The `queryParamFilters` values `query` carries, as one key, or `undefined`
 * when it carries none: what a kept state chosen under them is tied to.
 */
export function urlFilterScope(
  query: Record<string, unknown>,
  queryParamFilters: QueryParamFilters | undefined,
): string | undefined {
  const values = Object.keys(queryParamFilters ?? {})
    .filter((param) => query[param] !== undefined)
    .sort()
    .map((param) => [param, query[param]]);
  return values.length > 0 ? hashText(JSON.stringify(values)) : undefined;
}

/**
 * Whether the table was reached through a link that names what it lists: a
 * view, a record, a filter declared in `queryParamFilters`, or a tab. The
 * user's own choices are written in the URL or kept with it, so a reload is
 * not a link: one naming the kept tab, or the URL filters the kept state was
 * chosen under.
 */
export function isLinkedArrival(arrival: TableLinkArrival): boolean {
  const { query, urlScope, queryParamFilters } = arrival;
  const names = (key: string) => !!readTableUrlKey(query, urlScope, key).value;
  if (names(VIEW_URL_KEY) || names(RECORD_URL_KEY)) return true;
  const linkScope = urlFilterScope(query, queryParamFilters);
  if (linkScope !== undefined && linkScope !== arrival.keptLinkScope) {
    return true;
  }
  const tab = readTableUrlKey(query, urlScope, TAB_URL_KEY).value;
  return tab !== undefined && tab !== arrival.rememberedTab;
}

/**
 * The table's preferences as a link arrival reads them: the listing state
 * (`LINKED_STATE_FIELDS`) reads as its defaults, so the link applies over
 * the table's own default state rather than over the last visit's. The
 * kept state is only replaced once the user makes the state shown their own
 * (`linkFollowingPreferences`).
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

/** A kept field of the listing state, with its value shown and default. */
export type KeptListingField = [
  field: TableField,
  value: unknown,
  defaultValue: unknown,
];

/** What `linkFollowingPreferences` reads the table's link state from. */
export interface LinkFollowingOptions {
  /** The table arrived on a link (`isLinkedArrival`). */
  isLinkedArrival: boolean;
  urlScope: TableUrlScope;
  /** The URL filters the table lists under now (`urlFilterScope`). */
  linkScope: () => string | undefined;
  /** The listing state shown, as it is kept (`LINKED_STATE_FIELDS`). */
  listingState: () => KeptListingField[];
}

/** Preferences that leave a link's listing state unkept until it is the user's. */
export interface LinkFollowingPreferences extends TablePreferences {
  /**
   * Runs `change`, which opens a link on the table already shown: as on a
   * linked arrival, the state it sets is not kept.
   */
  followLink: (change: () => void) => Promise<void>;
  /** Called once the table is mounted: what changes from then is the user's. */
  settleArrival: () => Promise<void>;
}

/**
 * Wraps the table's preferences so the listing state a link opens (on
 * arrival or on the table already shown) does not overwrite the kept one,
 * which stays for the next plain visit. The table keeps its state from
 * watchers, which run on the next flush: what the link and the arrival set
 * is settled a tick later. The user's first choice from there (a view, a
 * tab, a filter, a sort) makes the state shown theirs: it is kept whole,
 * with the URL filters it was chosen under, and the view the link named
 * leaves the URL, which then reads as a plain visit on reload.
 */
export function linkFollowingPreferences(
  preferences: TablePreferences,
  options: LinkFollowingOptions,
): LinkFollowingPreferences {
  let isShowingLink = options.isLinkedArrival;
  let isSettled = false;

  const keepLinkScope = () =>
    preferences.set("linkScope", options.linkScope(), undefined);

  const takeOver = () => {
    isShowingLink = false;
    for (const [field, value, defaultValue] of options.listingState()) {
      preferences.set(field, value, defaultValue);
    }
    keepLinkScope();
    writeTableUrlKey(options.urlScope, VIEW_URL_KEY);
  };

  return {
    ...preferences,
    set: (field, value, defaultValue) => {
      if (!LINKED_STATE_FIELDS.has(field)) {
        preferences.set(field, value, defaultValue);
      } else if (!isShowingLink) {
        preferences.set(field, value, defaultValue);
        keepLinkScope();
      } else if (isSettled && USER_CHOICE_FIELDS.has(field)) {
        takeOver();
      }
    },
    followLink: async (change) => {
      isShowingLink = true;
      isSettled = false;
      try {
        change();
        await nextTick();
      } finally {
        isSettled = true;
      }
    },
    settleArrival: async () => {
      await nextTick();
      isSettled = true;
    },
  };
}
