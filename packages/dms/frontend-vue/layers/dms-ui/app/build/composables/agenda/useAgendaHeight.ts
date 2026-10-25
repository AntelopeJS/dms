// The height of the FullAgenda block: `fill` takes the height the page gives
// its filling block (marked `data-dms-page-fill` by the page renderer) or a
// drawer body; elsewhere a length. Read once mounted, and again when the
// page moves its fill to another block (one added under it) or a wrapper
// around the block stops being `display: contents`.

import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  type Ref,
} from "vue";
import { DMS_CONTAINER_KEY } from "../containers/context";
import {
  PAGE_FILL_ATTRIBUTE,
  fillPlaceOf,
  layoutParentOf,
  resolveAgendaHeight,
  type AgendaFillPlace,
} from "./agendaShell";
import { usePageFillHeight } from "#dms-layout/app/composables/layout/usePageFillHeight";

/** The height of the block whose root is `rootEl`, from its `height` option. */
export function useAgendaHeight(
  rootEl: Ref<HTMLElement | null>,
  heightOption: () => string | undefined,
) {
  const pageFills = usePageFillHeight();
  const inContainer = Boolean(inject(DMS_CONTAINER_KEY, undefined));
  const place = ref<AgendaFillPlace | null>(null);

  // What decides the fill: the layout parent's mark, and whether each
  // wrapper on the way is still `display: contents` (a permission veil may
  // turn into a box). Watched on every element from the parent up.
  const WATCHED = [PAGE_FILL_ATTRIBUTE, "class", "style"];
  let observer: MutationObserver | undefined;

  function watchChain(): void {
    const root = rootEl.value;
    if (!observer || !root) return;
    observer.disconnect();
    const last = layoutParentOf(root);
    for (
      let element = root.parentElement;
      element;
      element = element.parentElement
    ) {
      observer.observe(element, { attributeFilter: WATCHED });
      if (element === last) break;
    }
  }

  function measure(): void {
    if (!rootEl.value) return;
    place.value = fillPlaceOf(rootEl.value);
    // A wrapper turned into a box (or back): the chain to watch changed.
    watchChain();
  }

  onMounted(() => {
    if (typeof MutationObserver !== "undefined")
      observer = new MutationObserver(measure);
    measure();
  });
  onBeforeUnmount(() => observer?.disconnect());

  const height = computed(() =>
    resolveAgendaHeight(heightOption(), {
      pageFills: pageFills.value,
      inContainer,
      place: place.value,
    }),
  );
  // Filling, the block takes the flex column's height; the page region keeps
  // its own minimum, so the block sets none.
  const rootClass = computed(() => {
    if (!height.value.fill) return undefined;
    return inContainer ? "min-h-0 flex-1 h-full" : "min-h-0 flex-1";
  });
  const rootStyle = computed(() =>
    height.value.height ? { height: height.value.height } : undefined,
  );

  return { height, rootClass, rootStyle };
}
