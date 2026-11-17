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
import { usePageFillHeight } from "../../../composables/layout/usePageFillHeight";

/** The height of the block whose root is `rootEl`, from its `height` option. */
export function useAgendaHeight(
  rootEl: Ref<HTMLElement | null>,
  heightOption: () => string | undefined,
) {
  const pageFills = usePageFillHeight();
  const inContainer = Boolean(inject(DMS_CONTAINER_KEY, undefined));
  const place = ref<AgendaFillPlace | null>(null);

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
  const rootClass = computed(() => {
    if (!height.value.fill) return undefined;
    return inContainer ? "min-h-0 flex-1 h-full" : "min-h-0 flex-1";
  });
  const rootStyle = computed(() =>
    height.value.height ? { height: height.value.height } : undefined,
  );

  return { height, rootClass, rootStyle };
}
