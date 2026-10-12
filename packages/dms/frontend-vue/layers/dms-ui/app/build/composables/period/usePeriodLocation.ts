import { router as inertiaRouter } from "@inertiajs/vue3";
import { onMounted, watch } from "vue";
import type { UsePeriodReturn } from "#dms-core/app/composables/period/usePeriod";
import {
  isPeriodQueryCurrent,
  mergePeriodSearch,
  periodQueryKeys,
  isRangeOffered,
  rememberedPeriodKey,
  rememberPeriod,
  type RememberedPeriods,
  type RememberedPeriodTarget,
  type PeriodQuery,
  type PeriodQueryKeys,
  type PeriodSelection,
  type PeriodSource,
  resolvePeriodSelection,
  writePeriodQuery,
} from "./periodQuery";

export interface PeriodLocationOptions {
  /** The selector's id: the prefix of its URL keys. */
  id: string;
  /** The page it is on: its last choice is kept per page and per id. */
  pageId: string;
  /** Shares the last choice with every selector carrying it, on any page. */
  rememberKey?: string;
  /** What the period falls back to when no source names a valid one. */
  fallback: PeriodSelection;
}

/**
 * The preference holding the user's last choice of each selector
 * (`usePreferences`), capped to the most recent ones.
 */
export const PERIOD_PREFERENCE_KEY = "periods";
const STORED_KEYS = periodQueryKeys();

function readSelection(period: UsePeriodReturn): PeriodSelection {
  return {
    preset: period.preset.value,
    comparison: period.comparison.value,
    customRange: period.customRange.value,
    customCompareRange: period.customCompareRange.value,
  };
}

function applySelection(
  period: UsePeriodReturn,
  selection: PeriodSelection,
): void {
  period.customRange.value = selection.customRange;
  period.customCompareRange.value = selection.customCompareRange;
  period.preset.value = selection.preset;
  period.comparison.value = selection.comparison;
}

function urlKeysText(query: PeriodQuery, keys: PeriodQueryKeys): string {
  return JSON.stringify(Object.values(keys).map((key) => query[key] ?? null));
}

function selectionText(selection: PeriodSelection): string {
  return JSON.stringify(writePeriodQuery(selection, STORED_KEYS));
}

type DmsRouteState = ReturnType<typeof useDmsRoute>;

function browserQuery(): PeriodQuery {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

/**
 * Writes the period into the URL: the history entry is replaced, and no
 * request reloads the page. The browser's URL is written at once, so a
 * second selector writing in the same tick merges into it, and so is the
 * route's query: a component or a module building a query from the route
 * (a tab, a quick action) carries the new period on at once, instead of the
 * one the page was opened with. Inertia's client-side replace then moves its
 * page URL, which the route follows, a few ticks later, to the same query.
 */
function replacePeriodInUrl(
  route: DmsRouteState,
  keys: PeriodQueryKeys,
  selection: PeriodSelection,
): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const query = Object.fromEntries(url.searchParams);
  if (isPeriodQueryCurrent(query, keys, selection)) return null;
  url.search = mergePeriodSearch(url.search, keys, selection);
  const written = urlKeysText(Object.fromEntries(url.searchParams), keys);
  const fullPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", url);
  route.query = Object.fromEntries(url.searchParams);
  route.fullPath = fullPath;
  inertiaRouter.replace({
    url: fullPath,
    preserveState: true,
    preserveScroll: true,
  });
  return written;
}

/**
 * Until Inertia's page catches up with a URL written in place, the route can
 * still be set back to the page's previous query (a component reading the
 * route meanwhile refreshes it from that page). The address bar is ahead of
 * it, never behind: a route whose period keys differ from it is stale.
 */
function isRouteBehindBrowser(text: string, keys: PeriodQueryKeys): boolean {
  if (typeof window === "undefined") return false;
  return text !== urlKeysText(browserQuery(), keys);
}

/** The user's last choice of one selector, kept in the preferences. */
function useRememberedPeriod(target: RememberedPeriodTarget) {
  const { getPreference, setPreference } = usePreferences();
  const key = rememberedPeriodKey(target);
  const all = () => getPreference<RememberedPeriods>(PERIOD_PREFERENCE_KEY, {});
  return {
    source: (): PeriodSource => ({
      query: all()[key] ?? {},
      keys: STORED_KEYS,
    }),
    remember: (selection: PeriodSelection) =>
      setPreference(
        PERIOD_PREFERENCE_KEY,
        rememberPeriod(all(), key, writePeriodQuery(selection, STORED_KEYS)),
      ),
  };
}

/**
 * The URL writes of one selector. The route catches up with each write
 * later, and a pick made meanwhile must not be undone by the URL of the one
 * before: `isEcho` tells a route naming a URL written here from a change.
 */
function usePeriodUrlWriter(route: DmsRouteState, keys: PeriodQueryKeys) {
  const pending: string[] = [];
  return {
    write: (selection: PeriodSelection) => {
      const written = replacePeriodInUrl(route, keys, selection);
      if (written !== null) pending.push(written);
    },
    isEcho: (text: string) => {
      const index = pending.indexOf(text);
      if (index === -1) return false;
      pending.splice(0, index + 1);
      return true;
    },
  };
}

/**
 * Keeps a selector's period in the page URL (`?<id>.period=`, see
 * `periodQuery`) and its last choice in the user's preferences, per page or
 * under its `rememberKey`. The period starts from the URL, then from that
 * last choice, then from `fallback`. A URL range is taken even when `custom`
 * is not offered, and is then not remembered. Both
 * are read in setup, on the server too: the preferences are a cookie, so the
 * server renders the period the browser will show.
 *
 * The URL is written once mounted, so a copied URL always carries the
 * period, then on every change: the history entry is replaced instead of
 * pushed, so Back leaves the page rather than stepping through every pick,
 * and the page is not requested again, only the bound cards and tables
 * refetch. The route's query (`useDmsRoute().query`) follows each write at
 * once. A route changed from outside (Back to the page with another period,
 * a link) moves the period.
 */
export function usePeriodLocation(
  period: UsePeriodReturn,
  options: PeriodLocationOptions,
): void {
  const route = useDmsRoute();
  const urlKeys = periodQueryKeys(options.id);
  const remembered = useRememberedPeriod(options);
  const writer = usePeriodUrlWriter(route, urlKeys);
  const choices = {
    presets: period.presets.value,
    comparisons: period.comparisons.value,
  };
  const urlSource = (): PeriodSource => ({
    query: route.query as PeriodQuery,
    keys: urlKeys,
    isRangeAlwaysAccepted: true,
  });

  applySelection(
    period,
    resolvePeriodSelection(
      [urlSource(), remembered.source()],
      choices,
      options.fallback,
    ),
  );
  onMounted(() => writer.write(readSelection(period)));

  watch(
    () => selectionText(readSelection(period)),
    () => {
      const selection = readSelection(period);
      if (isRangeOffered(selection, choices)) remembered.remember(selection);
      writer.write(selection);
    },
  );

  // Only the route is followed here: the preferences move with the period.
  watch(
    () => urlKeysText(route.query as PeriodQuery, urlKeys),
    (text) => {
      if (writer.isEcho(text) || isRouteBehindBrowser(text, urlKeys)) return;
      const current = readSelection(period);
      const next = resolvePeriodSelection([urlSource()], choices, current);
      if (selectionText(next) === selectionText(current)) return;
      applySelection(period, next);
    },
  );
}
