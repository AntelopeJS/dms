import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowReactive,
  watch,
} from "vue";

// Only mounted bars count, so a server render never adds to it.
const shownBars = shallowReactive(new Set<symbol>());

/**
 * Whether a floating save bar (the one sticking to the bottom of the panel)
 * is on screen: what else sits in that corner steps aside for it.
 */
export const isFloatingSaveBarShown = computed(() => shownBars.size > 0);

/** Counts the calling floating save bar while `isShown` holds. */
export function trackFloatingSaveBar(isShown: () => boolean): void {
  const id = Symbol("floating-save-bar");
  const isMounted = ref(false);
  watch(
    () => isMounted.value && isShown(),
    (shown) => {
      if (shown) shownBars.add(id);
      else shownBars.delete(id);
    },
    { immediate: true },
  );
  onMounted(() => {
    isMounted.value = true;
  });
  onBeforeUnmount(() => {
    isMounted.value = false;
    shownBars.delete(id);
  });
}
