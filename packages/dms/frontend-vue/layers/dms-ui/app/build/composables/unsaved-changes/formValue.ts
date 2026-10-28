import {
  isObject,
  isNumber,
} from "../../../../../dms-core/app/utils/type-check";
/**
 * Value comparison behind the "unsaved changes" state of every form: a form
 * is dirty when what it holds differs, by value, from what it loaded (or last
 * saved). Typing a value then putting the original back makes it clean again.
 */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Form controls may hold arbitrary plugin values, including non-JSON instances.
type PlainObject = Record<string, unknown>;

/** Whether a value is a plain object (not a list, a date, a file or an instance). */
export function isPlainObject(value: unknown): value is PlainObject {
  if (!isObject(value) || value === null) return false;
  if (Array.isArray(value) || value instanceof Date) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Whether a value holds nothing: no value, an empty text, an empty list, an
 * unticked box or an object whose parts are all empty (an address nobody
 * filled). A control that empties itself to `""`, `null`, `[]` or `false`
 * leaves its field as clean as one never touched.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Emptiness accepts every value a plugin control can produce without rejecting malformed inputs.
export function isEmptyFormValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (value === "" || value === false) return true;
  if (isNumber(value)) return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.values(value).every(isEmptyFormValue);
  return false;
}

/**
 * Whether two form values are the same, compared deeply by value: lists item
 * by item (order counts), objects key by key (whatever their order), dates by
 * their time; any two empty values are the same (see {@link isEmptyFormValue}).
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Deep comparison intentionally accepts arbitrary control values on both sides.
export function sameFormValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  const isLeftEmpty = isEmptyFormValue(left);
  const isRightEmpty = isEmptyFormValue(right);
  if (isLeftEmpty || isRightEmpty) return isLeftEmpty && isRightEmpty;
  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameFormValue(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => sameFormValue(left[key], right[key]));
  }
  return false;
}

/**
 * A copy of a form value detached from the live one, so later edits never
 * reach it: lists, plain objects and dates are copied; files and other
 * instances are kept as they are (compared by identity).
 */
export function snapshotFormValue<T>(value: T): T {
  if (Array.isArray(value)) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Preserve the existing generic snapshot contract; array subclasses are not validated here.
    return value.map((item) => snapshotFormValue(item)) as T;
  }
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The existing clone returns a Date even for subclasses; do not claim that it verifies every T refinement.
  if (value instanceof Date) return new Date(value.getTime()) as T;
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The plain-object classifier must accept generic values without restricting plugin control types.
  if (isPlainObject(value)) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Preserve the existing generic clone contract without claiming validation of T refinements.
    return Object.fromEntries(
      Object.entries(value).map(([key, part]) => [
        key,
        snapshotFormValue(part),
      ]),
    ) as T;
  }
  return value;
}

/** The keys whose value differs between the current values and the baseline. */
export function changedFormKeys(
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Field names and values are defined by plugin controls, not a closed schema.
  current: Readonly<Record<string, unknown>>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The saved baseline holds the same arbitrary control values as current.
  baseline: Readonly<Record<string, unknown>>,
  keys: Iterable<string> = new Set([
    ...Object.keys(current),
    ...Object.keys(baseline),
  ]),
): string[] {
  return [...keys].filter((key) => !sameFormValue(current[key], baseline[key]));
}
