import {
  DEFAULT_COMPARISONS,
  type PeriodComparison,
} from "#dms-core/app/composables/period/types";

/** How a selector offers its comparisons. */
export type ComparisonControl = "menu" | "toggle" | "hidden";

/** What the selector was given about its comparisons. */
export interface ComparisonControlOptions {
  comparisons?: PeriodComparison[];
  defaultComparison?: PeriodComparison;
  comparisonControl?: ComparisonControl;
}

/** The comparison control a selector draws, and what its period offers. */
export interface ResolvedComparisonControl {
  control: ComparisonControl;
  /** The comparisons the period accepts: `none` too behind a toggle. */
  comparisons: PeriodComparison[];
  defaultComparison: PeriodComparison | undefined;
  /** The comparison a toggle switches on, else `null`. */
  toggled: PeriodComparison | null;
}

const NO_COMPARISON: PeriodComparison = "none";

function defaultControl(activeCount: number): ComparisonControl {
  return activeCount === 1 ? "toggle" : "menu";
}

function preferredComparison(
  active: PeriodComparison[],
  defaultComparison: PeriodComparison | undefined,
): PeriodComparison | null {
  const isActiveDefault =
    defaultComparison !== undefined && active.includes(defaultComparison);
  return isActiveDefault ? defaultComparison : (active[0] ?? null);
}

/**
 * The comparison control of a selector: a `menu` of its comparisons, an
 * inline `toggle` switching one comparison on and off (the default when it
 * offers a single one besides `none`), or `hidden`, the comparison kept on.
 * A selector offering no comparison besides `none` draws nothing.
 */
export function resolveComparisonControl(
  options: ComparisonControlOptions,
): ResolvedComparisonControl {
  const offered = options.comparisons ?? DEFAULT_COMPARISONS;
  const active = offered.filter((entry) => entry !== NO_COMPARISON);
  const preferred = preferredComparison(active, options.defaultComparison);
  const control: ComparisonControl = preferred
    ? (options.comparisonControl ?? defaultControl(active.length))
    : "hidden";
  const isToggle = control === "toggle";
  const isHidden = control === "hidden";
  return {
    control,
    comparisons:
      isToggle && !offered.includes(NO_COMPARISON)
        ? [NO_COMPARISON, ...offered]
        : [...offered],
    defaultComparison:
      isHidden && preferred
        ? (options.defaultComparison ?? preferred)
        : options.defaultComparison,
    toggled: isToggle ? preferred : null,
  };
}
