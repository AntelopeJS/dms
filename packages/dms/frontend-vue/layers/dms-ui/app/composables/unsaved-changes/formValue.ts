/**
 * Value comparison behind the "unsaved changes" state of every form: a form
 * is dirty when what it holds differs, by value, from what it loaded (or last
 * saved). Typing a value then putting the original back makes it clean again.
 */

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null) return false;
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
export function isEmptyFormValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (value === "" || value === false) return true;
  if (typeof value === "number") return Number.isNaN(value);
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
    return value.map((item) => snapshotFormValue(item)) as T;
  }
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (isPlainObject(value)) {
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
  current: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, unknown>>,
  keys: Iterable<string> = new Set([
    ...Object.keys(current),
    ...Object.keys(baseline),
  ]),
): string[] {
  return [...keys].filter((key) => !sameFormValue(current[key], baseline[key]));
}
