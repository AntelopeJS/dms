import { router as inertiaRouter } from "@inertiajs/vue3";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { usePeriodScope } from "#dms-core/app/composables/period/usePeriodScope";
import { browserTimeZone, readerTimeZone } from "#dms-core/app/utils/regional";
import type { PeriodState } from "#dms-core/app/composables/period/types";
import type {
  AgendaView,
  AgendaViewType,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import {
  mergePeriodSearch,
  parsePeriodDate,
  periodQueryKeys,
} from "../period/periodQuery";
import type {
  AgendaDayKey,
  AgendaRange,
  ResolvedAgendaView,
} from "./agendaModel";
import {
  buildAgendaRange,
  clampDay,
  clampDays,
  compactAgendaView,
  navigateAnchor,
  resolveAgendaViews,
  startsOnShownDay,
  viewSpan,
  visibleDay,
  type AgendaBounds,
} from "./agendaRange";
import {
  addDays,
  daysBetween,
  endOfMonth,
  isDayKey,
  startOfMonth,
  zonedDayKey,
} from "./agendaTime";

const NOW_TICK_MS = 60_000;
/** Views whose span a period scope sets (its number of days). */
const SPAN_VIEWS: ReadonlySet<AgendaViewType> = new Set([
  "days",
  "list",
  "resources",
  "timeline",
]);
const MAX_SCOPE_DAYS = 366;

export interface AgendaNavigationSetup {
  raw: FullAgendaOptions;
  timeZone: () => string;
  weekStartsOn: () => number;
  compact: ComputedRef<boolean>;
  /** A view's label when it gives none. */
  labelOf: (view: AgendaView) => string;
  /** The view and day the URL names, if any. */
  initialViewId?: string;
  initialDay?: AgendaDayKey;
}

/** The days a period scope picked, in the reader's own zone (where the selector computes them). */
interface ScopeDays {
  from: AgendaDayKey;
  to: AgendaDayKey;
}

const readerZone = () => readerTimeZone() ?? browserTimeZone();

function scopeDaysOf(state: PeriodState | null): ScopeDays | null {
  if (!state?.range) return null;
  const zone = readerZone();
  return {
    from: zonedDayKey(state.range.from.getTime(), zone),
    to: zonedDayKey(state.range.to.getTime(), zone),
  };
}

/** The period a view stands for, as a selector holds it: a whole month, a whole year, else the days it covers. */
function nominalSpan(
  view: ResolvedAgendaView,
  anchor: AgendaDayKey,
  weekStartsOn: number,
): ScopeDays {
  if (view.type === "month")
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  if (view.type === "year") {
    const year = anchor.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
  const { first, count } = viewSpan(view, anchor, weekStartsOn);
  return { from: first, to: addDays(first, count - 1) };
}

/**
 * Moves the `PeriodSelector` `id` to a custom range, as its own picks do:
 * the URL replaced in place, the route's query at once, Inertia's page a few
 * ticks later. The selector follows the route and the scope follows it.
 */
function movePeriodSelector(
  id: string,
  days: ScopeDays,
  state: PeriodState | null,
): void {
  if (typeof window === "undefined") return;
  const from = parsePeriodDate(days.from, "start");
  const to = parsePeriodDate(days.to, "end");
  if (!from || !to) return;
  const url = new URL(window.location.href);
  url.search = mergePeriodSearch(url.search, periodQueryKeys(id), {
    preset: "custom",
    customRange: { from, to },
    comparison: state?.comparison ?? "none",
    customCompareRange: state?.compareRange ?? null,
  });
  if (url.href === window.location.href) return;
  const route = useDmsRoute();
  const fullPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", url);
  route.query = Object.fromEntries(url.searchParams);
  route.fullPath = fullPath;
  inertiaRouter.replace({
    url: fullPath,
    preserveState: true,
    preserveScroll: true,
  });
}

/** The clock of the agenda: the current instant, moved every minute once mounted. */
function useNow(): Ref<number> {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    now.value = Date.now();
    timer = setInterval(() => (now.value = Date.now()), NOW_TICK_MS);
  });
  onBeforeUnmount(() => clearInterval(timer));
  return now;
}

function boundsOf(raw: FullAgendaOptions): AgendaBounds {
  return {
    min: isDayKey(raw.minDate) ? raw.minDate : undefined,
    max: isDayKey(raw.maxDate) ? raw.maxDate : undefined,
  };
}

/**
 * The agenda's views, the day its range is built around, and ‹ › Today:
 * the view picked (the compact one in a narrow container), the anchor held
 * within `minDate` / `maxDate`, and with `periodScope` the period of the
 * page's selector, which ‹ › Today move in turn.
 */
export function useAgendaNavigation(setup: AgendaNavigationSetup) {
  const { raw } = setup;
  const now = useNow();
  const bounds = boundsOf(raw);
  const views = computed(() =>
    resolveAgendaViews(raw.views, raw, setup.labelOf),
  );
  const firstViewId = () => views.value[0]?.id ?? "month";
  const isOffered = (id: string | undefined) =>
    Boolean(id && views.value.some((view) => view.id === id));
  const pickedViewId = ref(
    [setup.initialViewId, raw.initialView].find(isOffered) ?? firstViewId(),
  );
  const pickedView = computed(
    () =>
      views.value.find((view) => view.id === pickedViewId.value) ??
      views.value[0]!,
  );

  const scopeState = usePeriodScope(raw.periodScope);
  // A period picked past `minDate` / `maxDate` is shown within them.
  const scopeDays = computed(() => {
    const days = scopeDaysOf(scopeState.value);
    return days && clampDays(days, bounds);
  });

  const view = computed<ResolvedAgendaView>(() => {
    const shown = setup.compact.value
      ? compactAgendaView(
          pickedView.value,
          views.value,
          raw.responsive?.compactView,
        )
      : pickedView.value;
    const days = scopeDays.value;
    if (!days || !SPAN_VIEWS.has(shown.type)) return shown;
    const span = Math.min(daysBetween(days.from, days.to) + 1, MAX_SCOPE_DAYS);
    return { ...shown, duration: Math.max(span, 1) };
  });

  const today = computed(() => zonedDayKey(now.value, setup.timeZone()));
  // `today`, an absent or a malformed day: the day it is in the zone.
  const configuredDay = () =>
    isDayKey(raw.initialDate) ? raw.initialDate : today.value;
  const settle = (day: AgendaDayKey) =>
    clampDay(
      startsOnShownDay(view.value)
        ? visibleDay(day, view.value.hiddenDays)
        : day,
      bounds,
    );
  const anchor = ref<AgendaDayKey>(
    settle(scopeDays.value?.from ?? setup.initialDay ?? configuredDay()),
  );

  // A view that skips hidden days (a day or one-day resources view, picked
  // or shown once narrow) never starts on one: the week view's Saturday
  // moves to the next shown day.
  watch(
    () => `${view.value.id}|${view.value.type}|${view.value.hiddenDays.join()}`,
    () => {
      const settled = settle(anchor.value);
      if (settled !== anchor.value) anchor.value = settled;
    },
  );

  // The selector's period moves the agenda (a pick, Back, a link).
  watch(scopeDays, (days) => {
    if (days && days.from !== anchor.value) anchor.value = settle(days.from);
  });

  const range = computed<AgendaRange>(() =>
    buildAgendaRange(view.value, anchor.value, {
      weekStartsOn: setup.weekStartsOn(),
      timeZone: setup.timeZone(),
      today: today.value,
      exactStart: Boolean(scopeDays.value),
    }),
  );

  /** Moves to a day: the selector's period with `periodScope`, else the anchor. */
  function moveTo(day: AgendaDayKey): void {
    const next = settle(day);
    anchor.value = next;
    if (!raw.periodScope) return;
    const days = scopeDays.value;
    const span =
      days && SPAN_VIEWS.has(view.value.type)
        ? { from: next, to: addDays(next, daysBetween(days.from, days.to)) }
        : nominalSpan(view.value, next, setup.weekStartsOn());
    movePeriodSelector(raw.periodScope, span, scopeState.value);
  }

  const stepTo = (step: 1 | -1) =>
    navigateAnchor(
      view.value,
      anchor.value,
      step,
      setup.weekStartsOn(),
      bounds,
    );

  function setView(id: string): void {
    if (isOffered(id)) pickedViewId.value = id;
  }

  return {
    now,
    views,
    view,
    pickedViewId,
    setView,
    anchor,
    range,
    today,
    bounds,
    /** The day the agenda opens on without a URL: the URL leaves it out. */
    defaultDay: configuredDay,
    defaultViewId: () => [raw.initialView].find(isOffered) ?? firstViewId(),
    go: (step: 1 | -1) => {
      const next = stepTo(step);
      if (next) moveTo(next);
    },
    goToday: () => moveTo(today.value),
    goTo: (day: AgendaDayKey, viewType?: AgendaViewType) => {
      const target = viewType
        ? views.value.find((entry) => entry.type === viewType)
        : undefined;
      if (target) pickedViewId.value = target.id;
      moveTo(day);
    },
    /** Today is within `minDate` / `maxDate`: the Today button may go there. */
    canGoToday: computed(() => clampDay(today.value, bounds) === today.value),
    canGoPrevious: computed(() => stepTo(-1) !== null),
    canGoNext: computed(() => stepTo(1) !== null),
  };
}

export type AgendaNavigation = ReturnType<typeof useAgendaNavigation>;
