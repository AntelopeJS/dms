import type {
  Column,
  ColumnPinningPosition,
  SortDirection,
  Table,
} from "@tanstack/vue-table";
import type { Data } from "../../components/table/Table.vue";
import Button from "@nuxt/ui/components/Button.vue";
import DropdownMenu, {
  type DropdownMenuItem,
} from "@nuxt/ui/components/DropdownMenu.vue";
import {
  createMenuItem,
  createSeparator,
  createMenuItems,
} from "./utils/menuItemFactory";
import {
  type HeaderSortCue,
  headerSortCue,
  isDefaultSorting,
} from "../table-view/utils/sortableColumns";

import type { TableColumnContext } from "./tableColumnTypes";

const SORT_DIRECTION_ICON: Record<SortDirection, string> = {
  asc: "i-ph-arrow-up",
  desc: "i-ph-arrow-down",
};

const SORTABLE_LABEL_CLASS =
  "group/sort -mx-1.5 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-[3px] uppercase transition-colors hover:bg-elevated hover:text-default";

const HEADER_LABEL_CLASS = "truncate";

const SORTABLE_LABEL_ACTIVE_CLASS = "font-bold text-highlighted";

const SORT_IDLE_ICON = "i-ph-caret-up-down";

const SORT_ICON_BOX_CLASS = "inline-flex size-3 shrink-0";

const SORT_IDLE_ICON_CLASS =
  "size-3 shrink-0 text-dimmed transition-colors group-hover/sort:text-highlighted";

const SORT_DEFAULT_ICON_CLASS =
  "size-3 shrink-0 text-muted transition-colors group-hover/sort:text-highlighted";

const RIGHT_ALIGNED_HEADER_CLASS = "flex-row-reverse";

const RIGHT_ALIGNED_LABEL_CLASS = "flex-row-reverse";

export const buildHeaderRenderer = <T extends Data>(
  context: TableColumnContext<T>,
  label: string,
) => {
  const { config } = context;

  return ({ column, table }: { column: Column<T>; table: Table<T> }) => {
    const isPinned = column.getIsPinned();
    const isSorted = column.getIsSorted();
    const cue = headerSortCue({
      canSort: column.getCanSort(),
      sorted: isSorted,
      isDefaultSorting: isDefaultSorting(
        table.getState().sorting,
        config.defaultSort,
      ),
    });
    return createColumnHeader(context, column, label, {
      isPinned,
      isSorted,
      cue,
    });
  };
};

const createSortingMenuItems = <T extends Data>(
  context: TableColumnContext<T>,
  column: Column<T>,
): DropdownMenuItem[] => {
  const { t } = context;

  if (!column.getCanSort()) return [];

  return [
    createMenuItem(
      t("dms.table.sort_asc"),
      "i-ph-arrow-up",
      () => column.toggleSorting(false),
      { slot: "sort-asc" },
    ),
    createMenuItem(
      t("dms.table.sort_desc"),
      "i-ph-arrow-down",
      () => column.toggleSorting(true),
      { slot: "sort-desc" },
    ),
  ];
};

const createPinningMenuItem = <T extends Data>(
  context: TableColumnContext<T>,
  column: Column<T>,
  isPinned: ColumnPinningPosition,
): DropdownMenuItem => {
  const { t } = context;

  return createMenuItem(
    isPinned ? t("dms.table.unpin_column") : t("dms.table.pin_column"),
    isPinned ? "i-ph-push-pin" : "i-ph-push-pin-slash",
    () => column.pin(isPinned ? false : "left"),
  );
};

const createVisibilityMenuItem = <T extends Data>(
  context: TableColumnContext<T>,
  column: Column<T>,
): DropdownMenuItem => {
  const { t } = context;

  return createMenuItem(t("dms.table.toggle_visibility"), "i-ph-eye", () =>
    column.toggleVisibility(),
  );
};

const isRightAligned = <T extends Data>(column: Column<T>): boolean => {
  return column.columnDef.meta?.align === "right";
};

const cycleSorting = <T extends Data>(
  column: Column<T>,
  isSorted: false | SortDirection,
) => {
  if (isSorted === "desc") {
    column.clearSorting();
    return;
  }
  column.toggleSorting(isSorted === "asc", false);
};

const renderSortIcon = <T extends Data>(
  context: TableColumnContext<T>,
  cue: HeaderSortCue,
  isSorted: false | SortDirection,
  Icon: ReturnType<typeof resolveComponent>,
) => {
  const { config, t } = context;

  if (cue === "active" && isSorted) {
    return h(Icon, {
      name: SORT_DIRECTION_ICON[isSorted],
      class: config.ui.value.columnActiveSortIcon(),
    });
  }
  if (cue === "default" && isSorted) {
    return h(
      "span",
      { class: SORT_ICON_BOX_CLASS, title: t("dms.sort.default_sort") },
      [
        h(Icon, {
          name: SORT_DIRECTION_ICON[isSorted],
          class: SORT_DEFAULT_ICON_CLASS,
        }),
      ],
    );
  }
  return h(Icon, { name: SORT_IDLE_ICON, class: SORT_IDLE_ICON_CLASS });
};

const renderSortableLabel = <T extends Data>(
  context: TableColumnContext<T>,
  column: Column<T>,
  label: string,
  sorting: {
    isSorted: false | SortDirection;
    cue: HeaderSortCue;
    Icon: ReturnType<typeof resolveComponent>;
  },
) => {
  const { t } = context;
  const { isSorted, cue, Icon } = sorting;

  const labelNode = h(
    "span",
    { class: HEADER_LABEL_CLASS, title: label },
    label,
  );
  if (cue === "none") return labelNode;
  return h(
    "button",
    {
      type: "button",
      class: [
        SORTABLE_LABEL_CLASS,
        cue === "active" && SORTABLE_LABEL_ACTIVE_CLASS,
        isRightAligned(column) && RIGHT_ALIGNED_LABEL_CLASS,
      ],
      onClick: () => cycleSorting(column, isSorted),
    },
    [
      labelNode,
      renderSortIcon(context, cue, isSorted, Icon),
      cue === "default" &&
        h("span", { class: "sr-only" }, t("dms.sort.default_sort")),
    ],
  );
};

const createColumnHeader = <T extends Data>(
  context: TableColumnContext<T>,
  column: Column<T>,
  label: string,
  sorting: {
    isPinned: ColumnPinningPosition;
    isSorted: false | SortDirection;
    cue: HeaderSortCue;
  },
) => {
  const { config, appConfig } = context;
  const { isPinned, isSorted, cue } = sorting;

  const Icon = resolveComponent("Icon");

  if (config.columnMenus === false) {
    return h(
      "div",
      {
        class: [
          config.ui.value.headCellInternal(),
          isRightAligned(column) && RIGHT_ALIGNED_HEADER_CLASS,
        ],
      },
      [renderSortableLabel(context, column, label, { isSorted, cue, Icon })],
    );
  }

  const sortingItems = createSortingMenuItems(context, column);
  const visibilityItem = createVisibilityMenuItem(context, column);
  const pinningItem = createPinningMenuItem(context, column, isPinned);

  const menuItems = createMenuItems(
    ...sortingItems,
    visibilityItem,
    createSeparator(),
    pinningItem,
  );

  return h(
    "div",
    {
      class: [
        config.ui.value.headCellInternal(),
        isRightAligned(column) && RIGHT_ALIGNED_HEADER_CLASS,
      ],
    },
    [
      renderSortableLabel(context, column, label, { isSorted, cue, Icon }),
      h(
        DropdownMenu,
        {
          items: menuItems,
        },
        {
          default: () =>
            h(Button, {
              id: `col-header-${column.id}`,
              icon: appConfig.ui.icons.ellipsis,
              variant: ButtonVariant.ghost,
              size: Size.tiny,
              color: Color.neutral,
              square: true,
              class: config.ui.value.colOptionsTrigger(),
            }),
          "sort-asc-trailing": () =>
            isSorted === "asc"
              ? h(Icon, {
                  name: appConfig.ui.icons.check,
                  class: config.ui.value.columnActiveSortIcon(),
                })
              : undefined,
          "sort-desc-trailing": () =>
            isSorted === "desc"
              ? h(Icon, {
                  name: appConfig.ui.icons.check,
                  class: config.ui.value.columnActiveSortIcon(),
                })
              : undefined,
        },
      ),
    ],
  );
};
