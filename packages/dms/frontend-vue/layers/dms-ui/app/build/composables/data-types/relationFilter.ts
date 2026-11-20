import { isEmptyFormValue, sameFormValue } from "../unsaved-changes/formValue";
import { isBoolean, isNumber, isString } from "#dms-core/app/utils/type-check";

/**
 * A relation picker narrowed by another field of its form: the related
 * table's `field` must equal the form's value of `from`.
 */
export interface RelationFilterBy {
  field: string;
  from: string;
}

/** A fixed condition the related rows a picker lists must meet. */
export interface RelationFilter {
  field: string;
  mode: string;
  value?: string;
}

/** The compare mode the search route matches the related `field` with. */
const FILTER_MODE = "is";

type FilterValue = string | number | boolean;

function isFilterValue(
  value: RelationPickChange["source"],
): value is FilterValue {
  if (isString(value)) return value !== "";
  return isNumber(value) || isBoolean(value);
}

/**
 * The query narrowing the picker's search: the related table's filter
 * syntax (`filter_<field>=<mode>:<value>`), the one its funnel sends. The
 * fixed `filter` always applies; `filterBy` only while its source field
 * holds a single value. A field both name gets both conditions.
 */
export function relationFilterParams(
  filterBy: RelationFilterBy | undefined,
  sourceValue: RelationPickChange["source"],
  filter?: RelationFilter,
) {
  const params = new Map<string, string[]>();
  const add = (field: string, condition: string) => {
    const key = `filter_${field}`;
    params.set(key, [...(params.get(key) ?? []), condition]);
  };
  if (filter) add(filter.field, `${filter.mode}:${filter.value ?? ""}`);
  if (filterBy && isFilterValue(sourceValue)) {
    add(filterBy.field, `${FILTER_MODE}:${sourceValue}`);
  }
  return Object.fromEntries(params);
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
function hasRelationPick(value: RelationPickChange["pick"]): boolean {
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
