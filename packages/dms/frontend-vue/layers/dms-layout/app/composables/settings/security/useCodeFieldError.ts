import { nextTick, watch, type Ref } from "vue";

/**
 * The inline error of a two-factor code entry. A code the API refused empties
 * the cells and focuses the first one; a code flagged before sending (empty
 * or partial, see {@link flag}) keeps the digits and focuses the first empty
 * cell. Typing clears either.
 *
 * @param digits The cells' model
 * @param error The message shown under the cells, set by the parent
 * @param container Element holding the cells
 */
export function useCodeFieldError(
  digits: Ref<string[]>,
  error: Ref<string | undefined>,
  container: Ref<HTMLElement | null>,
) {
  let isResetting = false;
  let keepsDigits = false;

  function focusCell(): void {
    const cells = [
      ...(container.value?.querySelectorAll<HTMLInputElement>("input") ?? []),
    ];
    (cells.find((cell) => !cell.value) ?? cells[0])?.focus();
  }

  watch(error, async (message) => {
    if (!message) return;
    if (keepsDigits) {
      keepsDigits = false;
      await nextTick();
      focusCell();
      return;
    }
    isResetting = true;
    digits.value = [];
    await nextTick();
    isResetting = false;
    focusCell();
  });

  watch(
    digits,
    () => {
      if (!isResetting) error.value = undefined;
    },
    { deep: true },
  );

  /**
   * Shows a client-side error under the cells (nothing or part of the code
   * typed) without emptying them.
   *
   * @param message The text, already translated
   */
  function flag(message: string): void {
    if (error.value === message) {
      focusCell();
      return;
    }
    keepsDigits = true;
    error.value = message;
  }

  return { flag };
}
