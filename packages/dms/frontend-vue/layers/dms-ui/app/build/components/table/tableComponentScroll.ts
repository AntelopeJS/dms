import { computed, ref, useTemplateRef, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import {
  horizontalScrollEdges,
  type ScrollEdges,
} from "../../composables/table/utils/scrollEdges";
import type { Data, TableProps } from "./Table.types";

export function useTableComponentScroll<T extends Data>(props: TableProps<T>) {
  const hasScrollArea = computed(() => !!props.maxHeight);
  const isScrolled = ref(false);

  const scrollEdges = ref<ScrollEdges>({ start: false, end: false });
  const syncScrollEdges = () => {
    const area = tableRootRef.value;
    if (area) scrollEdges.value = horizontalScrollEdges(area);
  };
  const onTableScroll = (event: Event) => {
    syncScrollEdges();
    if (!hasScrollArea.value) return;
    // SAFETY: This scroll listener is attached directly to the table's scrolling section.
    isScrolled.value = (event.target as HTMLElement).scrollTop > 0;
  };

  const tableRootRef = useTemplateRef<HTMLElement>("tableRoot");
  const { width: tableViewportWidth } = useElementSize(tableRootRef);
  const tableBaseRef = useTemplateRef<HTMLElement>("tableBase");
  const { width: tableContentWidth } = useElementSize(tableBaseRef);
  watch([tableViewportWidth, tableContentWidth], syncScrollEdges);

  const tableHeadRef = useTemplateRef<HTMLElement>("tableHead");
  const { height: tableHeadHeight } = useElementSize(tableHeadRef, undefined, {
    box: "border-box",
  });
  const rootStyle = computed(() => ({
    "--dms-table-head-height":
      tableHeadHeight.value > 0 ? `${tableHeadHeight.value}px` : undefined,
  }));
  const tableRootStyle = computed(() => ({
    maxHeight: props.maxHeight,
    "--dms-table-viewport":
      tableViewportWidth.value > 0
        ? `${tableViewportWidth.value}px`
        : undefined,
  }));

  const syncClippedTitle = (event: MouseEvent) => {
    // SAFETY: The mouseenter bindings attach this listener to the caption span and cell divs.
    const cell = event.currentTarget as HTMLElement;
    if (cell.scrollWidth > cell.clientWidth) {
      cell.title = cell.textContent?.trim() ?? "";
    } else {
      cell.removeAttribute("title");
    }
  };

  return {
    hasScrollArea,
    isScrolled,
    scrollEdges,
    onTableScroll,
    tableRootRef,
    tableViewportWidth,
    rootStyle,
    tableRootStyle,
    syncClippedTitle,
  };
}
