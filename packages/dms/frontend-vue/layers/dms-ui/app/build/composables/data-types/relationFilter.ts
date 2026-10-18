import { isEmptyFormValue, sameFormValue } from "../unsaved-changes/formValue";

/**
 * A relation picker narrowed by another field of its form: the related
 * table's `field` must equal the form's value of `from`.
 */
export interface RelationFilterBy {
  field: string;
  from: string;
}

/** The compare mode the search route matches the related `field` with. */
const FILTER_MODE = "is";

type FilterValue = string | number | boolean;

function isFilterValue(value: unknown): value is FilterValue {
  if (typeof value === "string") return value !== "";
  return typeof value === "number" || typeof value === "boolean";
}

/**
 * The query narrowing the picker's search: the related table's filter
 * syntax (`filter_<field>=is:<value>`), the one its funnel sends. Nothing
 * while the source field holds no single value: every row is offered.
 */
export function relationFilterParams(
  filterBy: RelationFilterBy | undefined,
  sourceValue: unknown,
): Record<string, string> {
  if (!filterBy || !isFilterValue(sourceValue)) return {};
  return { [`filter_${filterBy.field}`]: `${FILTER_MODE}:${sourceValue}` };
}

/** The source field and the pick, before and after a change of either. */
export interface RelationPickChange {
  source: unknown;
  pick: unknown;
  previousSource: unknown;
  previousPick: unknown;
  /** The source value the current pick was made (or loaded) with. */
  pickSource: unknown;
}

/** Whether to clear the pick, and the source value the pick now goes with. */
export interface RelationPickOutcome {
  shouldClear: boolean;
  pickSource: unknown;
}

/** Whether a picker holds a value. */
function hasRelationPick(value: unknown): boolean {
  return !isEmptyFormValue(value);
}

/**
 * Whether a change of the source field voids the pick: made for another of
 * its values. A pick changing at the same time (a record loading both
 * values) or after goes with the current source; going back to the value the
 * pick was made with keeps it.
 */
export function resolveRelationPick(
  change: RelationPickChange,
): RelationPickOutcome {
  const isPickChange = !sameFormValue(change.pick, change.previousPick);
  if (isPickChange || !hasRelationPick(change.pick)) {
    return { shouldClear: false, pickSource: change.source };
  }
  const isSourceChange = !sameFormValue(change.source, change.previousSource);
  const isPickSource = sameFormValue(change.source, change.pickSource);
  return {
    shouldClear: isSourceChange && !isPickSource,
    pickSource: change.pickSource,
  };
}
