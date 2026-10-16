import {
  computed,
  getCurrentScope,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import {
  DEFAULT_COMPARISONS,
  DEFAULT_PRESETS,
  MS_PER_DAY,
  type PeriodComparison,
  type PeriodPreset,
  type PeriodRange,
  type PeriodState,
} from "./types";
import {
  isCalendarPreset,
  isRelativePreset,
  msUntilNextMidnight,
  resolvePresetRange,
} from "./presetResolvers";
import { resolveComparisonRange } from "./compareResolvers";
import { periodRenderNow } from "./periodRenderNow";

export interface UsePeriodOptions {
  defaultPreset?: PeriodPreset;
  defaultComparison?: PeriodComparison;
  presets?: PeriodPreset[];
  comparisons?: PeriodComparison[];
  /**
   * While it answers true, the period stops following the clock: a relative
   * preset stops sliding and a calendar preset does not move at midnight, so
   * nothing reading it refetches on the clock. What it skipped is caught up
   * once, when it answers false again. A period the user changes still
   * applies at once. The selector holds it while its live page is paused.
   */
  holdClock?: () => boolean;
}

export interface UsePeriodReturn {
  preset: Ref<PeriodPreset>;
  comparison: Ref<PeriodComparison>;
  customRange: Ref<PeriodRange | null>;
  customCompareRange: Ref<PeriodRange | null>;
  presets: ComputedRef<PeriodPreset[]>;
  comparisons: ComputedRef<PeriodComparison[]>;
  state: ComputedRef<PeriodState>;
  /**
   * The instant `state` was resolved from: what a label relative to now
   * reads, so it holds still with the period (see `periodRenderNow`).
   */
  resolvedAt: ComputedRef<Date>;
  setPreset: (preset: PeriodPreset) => void;
  setComparison: (comparison: PeriodComparison) => void;
  setCustomRange: (range: PeriodRange | null) => void;
  setCustomCompareRange: (range: PeriodRange | null) => void;
}

const FALLBACK_RANGE_DAYS = 30;
const FALLBACK_RANGE_MS = FALLBACK_RANGE_DAYS * MS_PER_DAY;
const DEFAULT_PRESET: PeriodPreset = "this-month";
const DEFAULT_COMPARISON: PeriodComparison = "none";
const RELATIVE_REFRESH_INTERVAL_MS = 60000;

const NEVER_HELD = () => false;

type ClockKind = "relative" | "calendar" | "still";

function clockKind(preset: PeriodPreset): ClockKind {
  if (isRelativePreset(preset)) return "relative";
  return isCalendarPreset(preset) ? "calendar" : "still";
}

const CLOCK_DELAYS: Record<Exclude<ClockKind, "still">, () => number> = {
  relative: () => RELATIVE_REFRESH_INTERVAL_MS,
  calendar: () => msUntilNextMidnight(new Date()),
};

/**
 * Ticks whenever the active preset's range moves on its own: every minute
 * for a relative preset, at each local midnight for a calendar one. Each
 * timeout is armed from the time it is set, so a machine waking from sleep
 * resolves once, then lines up on the next boundary again.
 */
function usePresetClock(
  preset: Ref<PeriodPreset>,
  isHeld: () => boolean = NEVER_HELD,
): Ref<number> {
  const tick = ref(0);
  if (typeof window === "undefined") return tick;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hasSkippedTick = false;
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = (kind: ClockKind) => {
    stop();
    if (kind === "still") return;
    timer = setTimeout(() => {
      if (isHeld()) hasSkippedTick = true;
      else tick.value += 1;
      arm(kind);
    }, CLOCK_DELAYS[kind]());
  };
  watch(() => clockKind(preset.value), arm, { immediate: true });
  watch(isHeld, (held) => {
    if (held || !hasSkippedTick) return;
    hasSkippedTick = false;
    tick.value += 1;
  });
  if (getCurrentScope()) onScopeDispose(stop);
  return tick;
}

function defaultFallbackRange(now: Date): PeriodRange {
  return {
    from: new Date(now.getTime() - FALLBACK_RANGE_MS),
    to: now,
  };
}

function buildKey(state: Omit<PeriodState, "key">): string {
  return [
    state.preset,
    state.comparison,
    state.range ? state.range.from.toISOString() : "-",
    state.range ? state.range.to.toISOString() : "-",
    state.compareRange ? state.compareRange.from.toISOString() : "-",
    state.compareRange ? state.compareRange.to.toISOString() : "-",
  ].join("|");
}

interface PeriodRefs {
  preset: Ref<PeriodPreset>;
  comparison: Ref<PeriodComparison>;
  customRange: Ref<PeriodRange | null>;
  customCompareRange: Ref<PeriodRange | null>;
}

function buildState(refs: PeriodRefs, now: Date): PeriodState {
  const fallback = refs.customRange.value ?? defaultFallbackRange(now);
  const range = resolvePresetRange(refs.preset.value, now, fallback);
  const compareRange = resolveComparisonRange(
    refs.comparison.value,
    range,
    refs.customCompareRange.value,
  );
  const partial = {
    preset: refs.preset.value,
    comparison: refs.comparison.value,
    range,
    compareRange,
  };
  return { ...partial, key: buildKey(partial) };
}

function makeSetters(refs: PeriodRefs) {
  return {
    setPreset: (next: PeriodPreset) => {
      refs.preset.value = next;
    },
    setComparison: (next: PeriodComparison) => {
      refs.comparison.value = next;
    },
    setCustomRange: (range: PeriodRange | null) => {
      refs.customRange.value = range;
      if (range) refs.preset.value = "custom";
    },
    setCustomCompareRange: (range: PeriodRange | null) => {
      refs.customCompareRange.value = range;
      if (range) refs.comparison.value = "custom";
    },
  };
}

/**
 * Reactive period state machine behind `PeriodSelector` — presets,
 * comparisons and custom ranges resolved into a publishable `state`.
 *
 * A server render and the browser hydrating it resolve from the same instant
 * (`periodRenderNow`), so both render the same bounds.
 *
 * Relative presets (`last-hour`, `last-24h`) re-resolve every minute, and
 * calendar presets (`today`, `last-7-days`, `this-month`...) at each local
 * midnight, so a page left open overnight moves on to the new day.
 *
 * Call it inside a component `setup` or an `effectScope`: the timer that
 * keeps the presets following the clock is disposed with that scope, and
 * leaks if none exists. Under `KeepAlive`, a deactivated component keeps its
 * scope, so the period keeps re-resolving until unmount.
 */
export function usePeriod(options: UsePeriodOptions = {}): UsePeriodReturn {
  const refs: PeriodRefs = {
    preset: ref<PeriodPreset>(options.defaultPreset ?? DEFAULT_PRESET),
    comparison: ref<PeriodComparison>(
      options.defaultComparison ?? DEFAULT_COMPARISON,
    ),
    customRange: ref<PeriodRange | null>(null),
    customCompareRange: ref<PeriodRange | null>(null),
  };
  const presets = computed<PeriodPreset[]>(
    () => options.presets ?? DEFAULT_PRESETS,
  );
  const comparisons = computed<PeriodComparison[]>(
    () => options.comparisons ?? DEFAULT_COMPARISONS,
  );
  const presetClock = usePresetClock(refs.preset, options.holdClock);
  // The server render's instant, until the clock ticks or the period changes
  // once on screen: what the setup applies (the URL's period) the server
  // applied as well.
  const renderNow = shallowRef(periodRenderNow());
  if (renderNow.value) {
    onMounted(() => {
      watch(
        [presetClock, ...Object.values(refs)],
        () => {
          renderNow.value = null;
        },
        { flush: "sync" },
      );
    });
  }
  const resolution = computed(() => {
    void presetClock.value;
    const now = renderNow.value ?? new Date();
    return { now, state: buildState(refs, now) };
  });
  const state = computed<PeriodState>(() => resolution.value.state);
  const resolvedAt = computed<Date>(() => resolution.value.now);
  const setters = makeSetters(refs);

  return {
    ...refs,
    presets,
    comparisons,
    state,
    resolvedAt,
    ...setters,
  };
}
