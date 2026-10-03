import { computed, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import { sameFormValue, snapshotFormValue } from "./formValue";

export interface UseFormDirtyOptions<T> {
  /**
   * The values the form started from, when the caller keeps them (the
   * profile it loaded, the role it saved): compared live instead of a
   * snapshot taken here.
   */
  initial?: () => T;
}

export interface UseFormDirtyReturn<T> {
  /** Whether the values differ, by value, from the starting ones. */
  dirty: ComputedRef<boolean>;
  /** The snapshot compared against (without an `initial` getter). */
  baseline: ShallowRef<T>;
  /**
   * Makes the current values (or the given ones) the new starting point:
   * after a successful save, or once the form is loaded.
   */
  markClean: (values?: T) => void;
}

/**
 * The "unsaved changes" state of a form: dirty while its values differ, deeply
 * and by value, from the ones it loaded or last saved. Putting the original
 * value back makes it clean again; `markClean` after a save resets the
 * starting point.
 *
 * @param values - The current values (read reactively).
 */
export function useFormDirty<T>(
  values: () => T,
  options: UseFormDirtyOptions<T> = {},
): UseFormDirtyReturn<T> {
  const baseline = shallowRef<T>(snapshotFormValue(values()));
  const dirty = computed(
    () =>
      !sameFormValue(
        values(),
        options.initial ? options.initial() : baseline.value,
      ),
  );

  function markClean(next: T = values()): void {
    baseline.value = snapshotFormValue(next);
  }

  return { dirty, baseline, markClean };
}
