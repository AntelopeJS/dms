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

/**
 * What `query` names as the table's view: an id, `""` for no view at all
 * (`?view=`), or `undefined` when it names none.
 */
const namedView = (
  query: Record<string, unknown>,
  urlScope: TableUrlScope,
): string | undefined => {
  const reading = readTableUrlKey(query, urlScope, VIEW_URL_KEY);
  return reading.isCleared ? "" : reading.value;
};

/** What the URL a table arrives on may name, and how it was reached. */
export interface TableLinkArrival {
  query: Record<string, unknown>;
  urlScope: TableUrlScope;
  queryParamFilters: QueryParamFilters | undefined;
  /** The page was reached through a visit, not loaded or gone back to. */
  isVisit: boolean;
  /** The tab kept from the last visit. */
  rememberedTab: string;
  /** The URL filters the kept state was chosen under (`urlFilterScope`). */
  keptLinkScope: string | undefined;
  /** The link the table last showed, unclaimed by the user (`linkKeyScope`). */
  shownLink: string | undefined;
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
 * What `query` names for the table (its view, tab and row, and the filters
 * declared in `queryParamFilters`), as one key, or `undefined` when it names
 * none of them: a URL spelling a key short or prefixed reads the same.
 */
export function linkKeyScope(
  query: Record<string, unknown>,
  urlScope: TableUrlScope,
  queryParamFilters: QueryParamFilters | undefined,
): string | undefined {
  const named = [
    [VIEW_URL_KEY, namedView(query, urlScope)],
    ...[TAB_URL_KEY, RECORD_URL_KEY].map((key) => [
      key,
      readTableUrlKey(query, urlScope, key).value,
    ]),
  ].filter(([, value]) => value !== undefined);
  const filters = Object.keys(queryParamFilters ?? {})
    .filter((param) => query[param] !== undefined)
    .sort()
    .map((param) => [`?${param}`, query[param]]);
  const values = [...named, ...filters];
  return values.length > 0 ? hashText(JSON.stringify(values)) : undefined;
}

/**
 * Whether the table was reached through a link that names what it lists: a
 * view, a record, a filter declared in `queryParamFilters`, or a tab. Reached
 * through a visit (a link clicked, a notification), it always is, even when
 * what it names is what the user left. Loaded in full (a reload) or gone back
 * to, the URL may be the one the table wrote for the user's own choices: it
 * is a link again when it is the link the table last showed, and when it
 * names a view or a record, or a tab or URL filters other than the kept
 * ones. A server render cannot tell a reload from a URL typed or opened in a
 * new browser tab, so a full load naming only the kept tab reads as one.
 */
export function isLinkedArrival(arrival: TableLinkArrival): boolean {
  const { query, urlScope, queryParamFilters } = arrival;
  const linkScope = linkKeyScope(query, urlScope, queryParamFilters);
  if (linkScope === undefined) return false;
  if (arrival.isVisit || linkScope === arrival.shownLink) return true;
  const names = (key: string) => !!readTableUrlKey(query, urlScope, key).value;
  if (namedView(query, urlScope) !== undefined || names(RECORD_URL_KEY)) {
    return true;
  }
  const filterScope = urlFilterScope(query, queryParamFilters);
  if (filterScope !== undefined && filterScope !== arrival.keptLinkScope) {
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
  /**
   * A link pushed on the page (one clicked, a notification): it is followed
   * even when it names what the table shows.
   */
  isLinkClick: boolean;
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
 * shown, back and forward) is a link to follow as an arrival would. A link
 * clicked on the page counts whenever it names a view or a tab the table can
 * open, a row or a URL filter, even what the table already shows: the state
 * around it may hide it. Otherwise (back and forward), the view and the tab
 * are written or kept in place, so they count when they differ from what the
 * table shows; a row and a URL filter when they differ from the last visit.
 * A visit repeating what the table already reads (the one that mounted it)
 * is not a link.
 */
export function isLinkedVisit(visit: TableLinkVisit): boolean {
  const { query, previousQuery, urlScope, isLinkClick } = visit;
  const read = (from: Record<string, unknown>, key: string) =>
    readTableUrlKey(from, urlScope, key).value;
  // A link clicked counts even when it names what is already there.
  const isNew = (value: unknown, current: unknown) =>
    isLinkClick || value !== current;
  const view = namedView(query, urlScope);
  if (view === "" && isNew(undefined, visit.activeView)) return true;
  if (view && isNew(view, visit.activeView) && visit.canOpenView(view)) {
    return true;
  }
  const tab = read(query, TAB_URL_KEY);
  if (tab && isNew(tab, visit.activeTab) && visit.canOpenTab(tab)) return true;
  const record = read(query, RECORD_URL_KEY);
  if (record && isNew(record, read(previousQuery, RECORD_URL_KEY))) return true;
  return namesUrlFilter(query, visit.queryParamFilters, (param) =>
    isNew(query[param], previousQuery[param]),
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
  /** What the URL shown names for the table now (`linkKeyScope`). */
  linkKeys: () => string | undefined;
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
 * leaves the URL, which then reads as a plain visit on reload. Until then,
 * the link shown is kept too (`shownLink`), so a reload shows it again.
 */
export function linkFollowingPreferences(
  preferences: TablePreferences,
  options: LinkFollowingOptions,
): LinkFollowingPreferences {
  let isShowingLink = options.isLinkedArrival;
  let isSettled = false;

  const keepLinkScope = () => {
    preferences.set("linkScope", options.linkScope(), undefined);
    preferences.set("shownLink", undefined, undefined);
  };
  const keepShownLink = () =>
    preferences.set("shownLink", options.linkKeys(), undefined);

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
        keepShownLink();
      } finally {
        isSettled = true;
      }
    },
    settleArrival: async () => {
      await nextTick();
      if (isShowingLink) keepShownLink();
      isSettled = true;
    },
  };
}
