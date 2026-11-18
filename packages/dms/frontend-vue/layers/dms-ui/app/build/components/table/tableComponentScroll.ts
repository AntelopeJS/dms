import { computed, ref, useTemplateRef } from "vue";
import { useElementSize } from "@vueuse/core";
import type { Data, TableProps } from "./Table.types";

export function useTableComponentScroll<T extends Data>(props: TableProps<T>) {
  const hasScrollArea = computed(() => !!props.maxHeight);
  const isScrolled = ref(false);

  const onTableScroll = (event: Event) => {
    if (!hasScrollArea.value) return;
    const { target } = event;
    isScrolled.value = target instanceof Element && target.scrollTop > 0;
  };

  const tableRootRef = useTemplateRef<HTMLElement>("tableRoot");
  const { width: tableViewportWidth } = useElementSize(tableRootRef);

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
    const cell = event.currentTarget;
    if (!(cell instanceof HTMLElement)) return;
    if (cell.scrollWidth > cell.clientWidth) {
      cell.title = cell.textContent?.trim() ?? "";
    } else {
      cell.removeAttribute("title");
    }
  };

  return {
    hasScrollArea,
    isScrolled,
    onTableScroll,
    tableRootRef,
    tableViewportWidth,
    rootStyle,
    tableRootStyle,
    syncClippedTitle,
  };
}
