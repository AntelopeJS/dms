import {
  computed,
  getCurrentScope,
  onScopeDispose,
  ref,
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
import { isRelativePreset, resolvePresetRange } from "./presetResolvers";
import { resolveComparisonRange } from "./compareResolvers";

export interface UsePeriodOptions {
  defaultPreset?: PeriodPreset;
  defaultComparison?: PeriodComparison;
  presets?: PeriodPreset[];
  comparisons?: PeriodComparison[];
  /**
   * While it answers true, a relative preset stops sliding: the period keeps
   * the range it had, so nothing reading it refetches on the clock. The
   * minutes it skipped are caught up once, when it answers false again. A
   * period the user changes still applies at once. The selector holds it
   * while its live page is paused.
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

function useRelativePresetClock(
  preset: Ref<PeriodPreset>,
  isHeld: () => boolean = NEVER_HELD,
): Ref<number> {
  const tick = ref(0);
  if (typeof window === "undefined") return tick;
  let timer: ReturnType<typeof setInterval> | null = null;
  let hasSkippedTick = false;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  watch(
    () => isRelativePreset(preset.value),
    (isRelative) => {
      stop();
      if (!isRelative) return;
      timer = setInterval(() => {
        if (isHeld()) hasSkippedTick = true;
        else tick.value += 1;
      }, RELATIVE_REFRESH_INTERVAL_MS);
    },
    { immediate: true },
  );
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

function buildState(refs: PeriodRefs): PeriodState {
  const now = new Date();
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
 * Call it inside a component `setup` or an `effectScope`: the interval that
 * keeps relative presets (`last-hour`, `last-24h`) sliding is disposed with
 * that scope, and leaks if none exists. Under `KeepAlive`, a deactivated
 * component keeps its scope, so a relative preset keeps ticking (one
 * re-resolution per minute) until unmount.
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
  const relativeClock = useRelativePresetClock(refs.preset, options.holdClock);
  const state = computed<PeriodState>(() => {
    void relativeClock.value;
    return buildState(refs);
  });
  const setters = makeSetters(refs);

  return {
    ...refs,
    presets,
    comparisons,
    state,
    ...setters,
  };
}
