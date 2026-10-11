import { watch } from "vue";
import type { UsePeriodReturn } from "#dms-core/app/composables/period/usePeriod";
import {
  isPeriodQueryCurrent,
  mergePeriodSearch,
  periodQueryKeys,
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
  /** What the period falls back to when no source names a valid one. */
  fallback: PeriodSelection;
}

/** Where the user's last choice of each selector is kept (`usePreferences`). */
export const PERIOD_PREFERENCE_PREFIX = "periods";
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

/**
 * Writes the period into the browser's URL in place, as a table writes its
 * open row: the history entry is replaced, and no visit reloads the page.
 */
function replacePeriodInUrl(
  keys: PeriodQueryKeys,
  selection: PeriodSelection,
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const query = Object.fromEntries(url.searchParams);
  if (isPeriodQueryCurrent(query, keys, selection)) return;
  url.search = mergePeriodSearch(url.search, keys, selection);
  window.history.replaceState(window.history.state, "", url);
}

/**
 * Keeps a selector's period in the page URL (`?<id>.period=`, see
 * `periodQuery`) and its last choice in the user's preferences. The period
 * starts from the URL, then from that last choice, then from `fallback`. Both
 * are read in setup, on the server too: the preferences are a cookie, so the
 * server renders the period the browser will show.
 *
 * A change replaces the history entry instead of pushing one, so Back leaves
 * the page rather than stepping through every pick, and makes no visit: the
 * page is not requested again, only the bound cards and tables refetch. A
 * route changed from outside (Back to the page with another period, a link)
 * moves the period.
 */
export function usePeriodLocation(
  period: UsePeriodReturn,
  options: PeriodLocationOptions,
): void {
  const route = useDmsRoute();
  const { getPreference, setPreference } = usePreferences();
  const urlKeys = periodQueryKeys(options.id);
  const preferenceKey = `${PERIOD_PREFERENCE_PREFIX}.${options.pageId}.${options.id}`;
  const choices = {
    presets: period.presets.value,
    comparisons: period.comparisons.value,
  };

  const urlSource = (): PeriodSource => ({
    query: route.query as PeriodQuery,
    keys: urlKeys,
  });
  const storedSource = (): PeriodSource => ({
    query: getPreference<PeriodQuery>(preferenceKey, {}),
    keys: STORED_KEYS,
  });

  applySelection(
    period,
    resolvePeriodSelection(
      [urlSource(), storedSource()],
      choices,
      options.fallback,
    ),
  );

  watch(
    () => selectionText(readSelection(period)),
    () => {
      const selection = readSelection(period);
      setPreference(preferenceKey, writePeriodQuery(selection, STORED_KEYS));
      replacePeriodInUrl(urlKeys, selection);
    },
  );

  // Only the route is followed here: the preferences move with the period.
  // The route follows visits, not the in-place writes above, so this only
  // runs for a URL that changed from outside.
  watch(
    () => urlKeysText(route.query as PeriodQuery, urlKeys),
    () => {
      const current = readSelection(period);
      const next = resolvePeriodSelection([urlSource()], choices, current);
      if (selectionText(next) === selectionText(current)) return;
      applySelection(period, next);
    },
  );
}
