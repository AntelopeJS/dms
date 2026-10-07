import type { ComputedRef } from "vue";
import {
  type SidePanel,
  useAppSidePanels,
} from "../../../composables/useAppSidePanels";

/**
 * The ids of the open panels, oldest opening first: the panels still open
 * keep their place, and the ones that just opened join at the end in
 * registration order.
 *
 * @internal
 */
export function nextOpenOrder(
  previous: readonly string[],
  openIds: readonly string[],
): string[] {
  const stillOpen = previous.filter((id) => openIds.includes(id));
  const opened = openIds.filter((id) => !stillOpen.includes(id));
  return [...stillOpen, ...opened];
}

/**
 * The side panel the dashboard shows: the open panel opened last.
 *
 * @internal
 */
export function useActiveSidePanel(): ComputedRef<SidePanel | null> {
  const { openPanels } = useAppSidePanels();
  const openOrder = ref<string[]>([]);
  // Synchronous, so the panel shown never lags one render behind `isOpen`.
  watch(
    () => openPanels.value.map((panel) => panel.id),
    (openIds) => {
      openOrder.value = nextOpenOrder(openOrder.value, openIds);
    },
    { immediate: true, flush: "sync" },
  );
  return computed(() => {
    const activeId = openOrder.value.at(-1);
    return openPanels.value.find((panel) => panel.id === activeId) ?? null;
  });
}
