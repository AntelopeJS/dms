// The height of the FullAgenda block: `fill` takes the height the page gives
// its filling block (marked `data-dms-page-fill` by the page renderer) or a
// drawer body; elsewhere a length. Read once mounted, and again when the
// page moves its fill to another block (one added under it).

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

  const measure = () => {
    if (rootEl.value) place.value = fillPlaceOf(rootEl.value);
  };
  let observer: MutationObserver | undefined;
  onMounted(() => {
    measure();
    const parent = rootEl.value && layoutParentOf(rootEl.value);
    if (!parent || typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(measure);
    observer.observe(parent, { attributeFilter: [PAGE_FILL_ATTRIBUTE] });
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
