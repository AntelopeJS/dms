import { nextTick, watch, type Ref } from "vue";

/**
 * The inline error of a two-factor code entry (a code the API refused): the
 * cells empty and the first one takes the focus, then typing clears it.
 *
 * @param digits The cells' model
 * @param error The message shown under the cells, set by the parent
 * @param container Element holding the cells
 */
export function useCodeFieldError(
  digits: Ref<string[]>,
  error: Ref<string | undefined>,
  container: Ref<HTMLElement | null>,
): void {
  let isResetting = false;

  watch(error, async (message) => {
    if (!message) return;
    isResetting = true;
    digits.value = [];
    await nextTick();
    isResetting = false;
    container.value?.querySelector<HTMLInputElement>("input")?.focus();
  });

  watch(
    digits,
    () => {
      if (!isResetting) error.value = undefined;
    },
    { deep: true },
  );
}
