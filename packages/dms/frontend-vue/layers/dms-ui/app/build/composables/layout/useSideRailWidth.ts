import { useMutationObserver, useResizeObserver } from "@vueuse/core";
import type { Ref } from "vue";

/**
 * A bar fixed on the right edge of the window that a module draws on the
 * page, outside the side panel host, while its panel is folded. The assistant's
 * fold bar is one: `data-dms-side-rail` is the marker a module puts on its bar,
 * and `.dms-assistant-fold` is the assistant's own class, which carries no
 * marker yet.
 *
 * @internal
 */
export const SIDE_RAIL_SELECTOR = "[data-dms-side-rail], .dms-assistant-fold";

/**
 * Set to the rail's width in px on a surface that keeps room free for it, as
 * {@link SIDE_PANEL_WIDTH_VARIABLE} does for the open panel.
 *
 * @internal
 */
export const SIDE_RAIL_WIDTH_VARIABLE = "--dms-side-rail-width";

/**
 * The width in px of the rail on the right edge, 0 while none is drawn. A
 * module mounts its rail on its own, after the page, so the page watches the
 * document for it and for its size. Client only: the server renders no rail.
 *
 * @internal
 */
export function useSideRailWidth(): Readonly<Ref<number>> {
  const width = ref(0);
  const body = shallowRef<HTMLElement | null>(null);
  const rail = shallowRef<HTMLElement | null>(null);

  function findRail(): void {
    rail.value = document.querySelector<HTMLElement>(SIDE_RAIL_SELECTOR);
  }

  function measure(): void {
    width.value = rail.value
      ? Math.round(rail.value.getBoundingClientRect().width)
      : 0;
  }

  onMounted(() => {
    body.value = document.body;
    findRail();
  });
  useMutationObserver(body, findRail, { childList: true, subtree: true });
  useResizeObserver(rail, measure);
  watch(rail, measure);
  return width;
}
