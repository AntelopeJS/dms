import { computed, type Ref } from "vue";
import type { Table, Column, Header } from "@tanstack/vue-table";

export function useTableComponentPinning<T>(
  getTable: () => Table<T>,
  tableViewportWidth: Ref<number>,
  hasPresenceRail: Ref<boolean>,
) {
  const PRESENCE_RAIL_WIDTH = 2;
  const PINNED_MAX_VIEWPORT_SHARE = 0.6;
  const stickyPinnedSides = computed(() => {
    const budget = tableViewportWidth.value * PINNED_MAX_VIEWPORT_SHARE;
    const left = getTable().getLeftTotalSize();
    const right = getTable().getRightTotalSize();
    if (!budget || left + right <= budget) return { left: true, right: true };
    const keepLeft = left < right && left <= budget;
    const keepRight = left >= right && right <= budget;
    return { left: keepLeft, right: keepRight };
  });

  const scrollFadeInsets = computed(() => {
    const sides = stickyPinnedSides.value;
    return {
      start:
        (sides.left ? getTable().getLeftTotalSize() : 0) +
        (hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0),
      end: sides.right ? getTable().getRightTotalSize() : 0,
    };
  });

  const getStickyPin = (column: Pick<Column<T>, "getIsPinned">) => {
    const pinned = column.getIsPinned();
    if (pinned === "left" && stickyPinnedSides.value.left) return "left";
    if (pinned === "right" && stickyPinnedSides.value.right) return "right";
    return undefined;
  };

  const getPinnedLeftOffset = (
    column: Pick<Column<T>, "getIsPinned" | "getStart">,
  ) => {
    if (getStickyPin(column) !== "left") return undefined;
    const base = column.getStart("left");
    const rail = hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0;
    return `${base + rail}px`;
  };

  const getPinnedRightOffset = (
    column: Pick<Column<T>, "getIsPinned" | "getAfter">,
  ) => {
    if (getStickyPin(column) !== "right") return undefined;
    return `${column.getAfter("right")}px`;
  };

  const getPinnedVariant = getStickyPin;

  const MIN_SCROLLING_COLUMN_WIDTH = 120;
  const scrollingColumnMaxWidth = computed(() => {
    const viewport = tableViewportWidth.value;
    if (!viewport) return Infinity;
    const sides = stickyPinnedSides.value;
    const sticky =
      (sides.left ? getTable().getLeftTotalSize() : 0) +
      (sides.right ? getTable().getRightTotalSize() : 0) +
      (hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0);
    return Math.max(viewport - sticky, MIN_SCROLLING_COLUMN_WIDTH);
  });

  const getHeaderWidth = (header: Header<T, unknown>): string => {
    const size = header.getSize();
    if (getStickyPin(header.column)) return `${size}px`;
    return `${Math.min(size, scrollingColumnMaxWidth.value)}px`;
  };

  const headerAriaSort = (
    column: Header<T, unknown>["column"],
  ): "ascending" | "descending" | "none" | undefined => {
    if (!column.getCanSort()) return undefined;
    const sorted = column.getIsSorted();
    if (sorted === "asc") return "ascending";
    if (sorted === "desc") return "descending";
    return "none";
  };

  return {
    scrollFadeInsets,
    getPinnedLeftOffset,
    getPinnedRightOffset,
    getPinnedVariant,
    getHeaderWidth,
    headerAriaSort,
  };
}
