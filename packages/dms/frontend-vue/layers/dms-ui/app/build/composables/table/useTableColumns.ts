import type {
  Column,
  ColumnMeta,
  ColumnPinningPosition,
  SortDirection,
} from "@tanstack/vue-table";
import type {
  Data,
  TableColumn,
  TableEmits,
  TableRowActionOptions,
} from "../../components/table/Table.vue";
import { upperFirst } from "scule";
import Button from "@nuxt/ui/components/Button.vue";
import Checkbox from "@nuxt/ui/components/Checkbox.vue";
import DropdownMenu, {
  type DropdownMenuItem,
} from "@nuxt/ui/components/DropdownMenu.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { useClipboard } from "@vueuse/core";
import {
  createMenuItem,
  createSeparator,
  createMenuItems,
} from "./utils/menuItemFactory";
import { ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./constants";
import {
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "../table-view/types";
import type { FormContainer } from "../table-view/useTableViewConfig";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

const SORT_DIRECTION_ICON: Record<SortDirection, string> = {
  asc: "i-ph-arrow-up",
  desc: "i-ph-arrow-down",
};

const ACTIONS_COLUMN_BASE_SIZE = 55;
const ACTIONS_COLUMN_BUTTON_SIZE = 36;

const BUILTIN_ROW_ACTION_KEYS = [
  "copyLink",
  "details",
  "edit",
  "duplicate",
  "delete",
  "archive",
  "restore",
] as const;

interface RowActionDescriptor {
  label: string;
  icon: string;
  onSelect: () => void;
  disabled: boolean;
  color?: Color;
  visible: boolean;
}

export interface LabeledColumn<T> {
  label: string;
  column: Column<T>;
}

type StyleSlot = (options?: Record<string, unknown>) => string;

export interface TableStyleSlots {
  headCellInternal: StyleSlot;
  rowAction: StyleSlot;
  rowSelection: StyleSlot;
  colOptionsTrigger: StyleSlot;
  columnActiveSortIcon: StyleSlot;
  [key: string]: StyleSlot;
}

interface ColumnConfig<T> {
  data: ComputedRef<T[]>;
  columns?: TableColumn<T>[];
  rowIdKey: string;
  rowActions?: TableRowActionOptions;
  canExport?: boolean;
  emits: TableEmits<T>;
  ui: ComputedRef<TableStyleSlots>;
  componentId?: string;
  formContainer?: FormContainer;
  onCustomRowAction?: (action: CustomRowAction, rowData: T) => void;
}

interface ExtendedColumnMeta<T> extends ColumnMeta<T, unknown> {
  label?: string;
}

export const useTableColumns = <T extends Data>(config: ColumnConfig<T>) => {
  const { getDataType } = useDataTypes();
  const { locale, t } = useI18n();
  const router = useDmsRouter();
  const toast = useToast();
  const appConfig = useDmsAppConfig() as DmsAppConfig;
  const { copy: copyToClipboard } = useClipboard({ legacy: true });

  const columnInfos: TableColumn<T>[] =
    config.columns ??
    Object.keys(config.data.value[0] ?? {}).map((accessorKey: string) => ({
      accessorKey,
      header: upperFirst(accessorKey),
    }));

  const buildTypedCell = (col: TableColumn<T>) => {
    return ({ row }: { row: { getValue: (id: string) => unknown } }) => {
      const value = row.getValue(col.id!);
      const typeData = col.type!;
      const options = typeData.inputComponent.options as
        | Record<string, unknown>
        | undefined;

      if (value === null || value === undefined) {
        return (options?.fallback as string) ?? "-";
      }

      const formatter = getDataType(typeData.id)?.formatter;
      if (formatter) {
        return formatter.default(value, locale.value, options);
      }

      return value;
    };
  };

  const buildHeaderRenderer = (label: string) => {
    return ({ column }: { column: Column<T> }) => {
      const isPinned = column.getIsPinned();
      const isSorted = column.getIsSorted();
      return createColumnHeader(column, label, isPinned, isSorted);
    };
  };

  const processColumn = (col: TableColumn<T>): TableColumn<T> => {
    if (!col.id && "accessorKey" in col) {
      col.id = col.accessorKey as string;
    }

    if (!isString(col.header) || col.id === ACTIONS_COLUMN_ID) {
      return col;
    }

    if (col.type) {
      col.cell = buildTypedCell(col);
    }

    const label = col.header;
    if (!col.meta) {
      col.meta = {} as ExtendedColumnMeta<T>;
    }
    (col.meta as ExtendedColumnMeta<T>).label = label;

    col.header = buildHeaderRenderer(label);
    return col;
  };

  const columns = computed(() => {
    const processedColumns = [...columnInfos].map(processColumn);

    addRowSelectionColumn(processedColumns);
    addRowActionsColumn(processedColumns);

    return processedColumns;
  });

  const addRowSelectionColumn = (columns: TableColumn<T>[]) => {
    const hasBulkAction =
      normalizeActionConfig(config.rowActions?.delete).isEnabled ||
      config.canExport === true;

    if (!config.rowActions?.hasSelection || !hasBulkAction) {
      return;
    }

    // 16px checkbox + rowCell p-4 (16px each side) + 4px slack: anything
    // narrower lets the row's clipping wrapper cut the checkbox.
    columns.unshift({
      id: SELECT_COLUMN_ID,
      size: 52,
      enableColumnFilter: false,
      header: ({ table }) =>
        h(Checkbox, {
          modelValue: table.getIsSomePageRowsSelected()
            ? "indeterminate"
            : table.getIsAllPageRowsSelected(),
          "onUpdate:modelValue": (value: unknown) =>
            table.toggleAllPageRowsSelected(Boolean(value)),
          ariaLabel: "Select all",
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          "data-checked": row.getIsSelected(),
          modelValue: row.getIsSelected(),
          "onUpdate:modelValue": (value: unknown) =>
            row.toggleSelected(Boolean(value)),
          class: config.ui.value.rowSelection({
            rowSelected: row.getIsSelected(),
          }),
          onClick: (e: Event) => e.stopPropagation(),
          onDblclick: (e: Event) => e.stopPropagation(),
        }),
    });
  };

  const countConfiguredVisibleActions = (): number => {
    let count = 0;
    for (const key of BUILTIN_ROW_ACTION_KEYS) {
      if (isActionVisible(config.rowActions?.[key])) count++;
    }
    for (const action of config.rowActions?.custom || []) {
      if (action.visible) count++;
    }
    return count;
  };

  const renderActionButton = (descriptor: RowActionDescriptor, rowId: string) =>
    h(Button, {
      id: `row-action-${rowId}-${descriptor.icon}`,
      "aria-label": descriptor.label,
      title: descriptor.label,
      icon: descriptor.icon,
      color: descriptor.color || Color.neutral,
      variant: ButtonVariant.ghost,
      size: Size.tiny,
      onClick: (event: Event) => {
        event.stopPropagation();
        descriptor.onSelect();
      },
    });

  const renderActionsDropdown = (items: DropdownMenuItem[], rowId: string) =>
    h(
      DropdownMenu as Component,
      {
        modal: false,
        ui: { content: "min-w-48" },
        items,
      },
      {
        default: () =>
          h(Button, {
            id: `row-actions-${rowId}`,
            icon: appConfig.ui.icons.ellipsis,
            color: Color.neutral,
            variant: ButtonVariant.ghost,
            size: Size.tiny,
          }),
      },
    );

  const hasAnyRowAction = (): boolean => {
    const builtInEnabled = [
      config.rowActions?.add,
      config.rowActions?.delete,
      config.rowActions?.duplicate,
      config.rowActions?.edit,
      config.rowActions?.details,
    ].some((flag) => normalizeActionConfig(flag).isEnabled);

    const hasCustomActions =
      !!config.rowActions?.custom && config.rowActions.custom.length > 0;

    return builtInEnabled || hasCustomActions;
  };

  const renderActionsCell = (row: { original: T; id: string }) => {
    const descriptors = buildRowActionDescriptors(row.original).filter(
      (d) => !d.disabled,
    );
    const visibleDescriptors = descriptors.filter((d) => d.visible);
    const dropdownItems = descriptors
      .filter((d) => !d.visible)
      .map(descriptorToMenuItem);

    if (visibleDescriptors.length === 0 && dropdownItems.length === 0) {
      return null;
    }

    const children = visibleDescriptors.map((d) =>
      renderActionButton(d, row.id),
    );
    if (dropdownItems.length > 0) {
      children.push(renderActionsDropdown(dropdownItems, row.id));
    }

    return h(
      "div",
      {
        class: config.ui.value.rowAction(),
        onClick: (e: Event) => e.stopPropagation(),
      },
      children,
    );
  };

  const addRowActionsColumn = (columns: TableColumn<T>[]) => {
    if (!hasAnyRowAction()) {
      return;
    }

    const visibleActionCount = countConfiguredVisibleActions();
    const columnSize =
      ACTIONS_COLUMN_BASE_SIZE +
      visibleActionCount * ACTIONS_COLUMN_BUTTON_SIZE;

    columns.push({
      id: ACTIONS_COLUMN_ID,
      size: columnSize,
      enableColumnFilter: false,
      cell: ({ row }) => renderActionsCell(row),
    });
  };

  const isActionDisabled = (
    actionConfig: boolean | RowActionConfig | undefined,
    rowData: T,
  ): boolean => {
    const actionConfigNormalized = normalizeActionConfig(actionConfig);
    if (!actionConfigNormalized.isEnabled) return true;
    if (!actionConfigNormalized.rule) return false;

    const validator = createActionValidator(
      actionConfigNormalized,
      config.data.value,
      config.rowIdKey,
    );
    return !validator.canPerformAction(get(rowData, config.rowIdKey));
  };

  const { processI18n } = useTranslation();

  const isCustomActionDisabled = (
    action: CustomRowAction,
    rowData: T,
  ): boolean => {
    if (!action.rule) return false;

    const validator = createActionValidator(
      { isEnabled: true, rule: action.rule },
      config.data.value,
      config.rowIdKey,
    );
    return !validator.canPerformAction(get(rowData, config.rowIdKey));
  };

  const buildCopyLinkOnSelect = (rowData: T) => async () => {
    let itemUrl: string;
    const currentRoute = router.currentRoute.value;

    const containerType =
      config.formContainer?.type ?? DEFAULT_FORM_CONTAINER_TYPE;
    if (containerType === FormContainerType.page) {
      const itemId = get(rowData, config.rowIdKey);
      const viewSlug =
        config.formContainer?.pages?.view?.urlSlug ||
        `${currentRoute.path}/${itemId}/view`;
      const viewUrl = viewSlug.replace(":id", itemId);
      itemUrl = `${window.location.origin}${viewUrl}`;
    } else {
      const updatedQuery = {
        ...currentRoute.query,
        [`${config.componentId}:id`]: get(rowData, config.rowIdKey),
      };
      itemUrl = `${window.location.origin}${currentRoute.path}?${new URLSearchParams(updatedQuery).toString()}`;
    }

    await copyToClipboard(itemUrl);

    toast.add({
      title: t("dms.table.link_copied"),
      color: Color.success,
    });
  };

  const buildCustomActionDescriptors = (rowData: T): RowActionDescriptor[] =>
    (config.rowActions?.custom || []).map((action) => ({
      label: processI18n(action.label),
      icon: action.icon || "i-ph-lightning",
      onSelect: () => config.onCustomRowAction?.(action, rowData),
      disabled: isCustomActionDisabled(action, rowData),
      visible: action.visible === true,
    }));

  const buildBuiltInActionDescriptors = (rowData: T): RowActionDescriptor[] => [
    {
      label: t("dms.button.copy_link"),
      icon: "i-ph-link",
      onSelect: buildCopyLinkOnSelect(rowData),
      disabled: isActionDisabled(config.rowActions?.copyLink, rowData),
      visible: isActionVisible(config.rowActions?.copyLink),
    },
    {
      label: t("dms.button.details"),
      icon: "i-ph-info",
      onSelect: () => config.emits("details", rowData),
      disabled: isActionDisabled(config.rowActions?.details, rowData),
      visible: isActionVisible(config.rowActions?.details),
    },
    {
      label: t("dms.button.edit"),
      icon: "i-ph-pencil",
      onSelect: () => config.emits("edit", rowData),
      disabled: isActionDisabled(config.rowActions?.edit, rowData),
      visible: isActionVisible(config.rowActions?.edit),
    },
    {
      label: t("dms.button.duplicate"),
      icon: "i-ph-copy",
      onSelect: () => config.emits("duplicate", get(rowData, config.rowIdKey)),
      disabled: isActionDisabled(config.rowActions?.duplicate, rowData),
      visible: isActionVisible(config.rowActions?.duplicate),
    },
    {
      label: t("dms.button.delete"),
      icon: "i-ph-trash",
      onSelect: () => config.emits("delete", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.delete, rowData),
      visible: isActionVisible(config.rowActions?.delete),
      color: Color.error,
    },
    {
      label: t("dms.button.archive"),
      icon: "i-ph-archive",
      onSelect: () => config.emits("archive", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.archive, rowData),
      visible: isActionVisible(config.rowActions?.archive),
    },
    {
      label: t("dms.button.restore"),
      icon: "i-ph-arrow-counter-clockwise",
      onSelect: () => config.emits("restore", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.restore, rowData),
      visible: isActionVisible(config.rowActions?.restore),
    },
  ];

  const buildRowActionDescriptors = (rowData: T): RowActionDescriptor[] => [
    ...buildCustomActionDescriptors(rowData),
    ...buildBuiltInActionDescriptors(rowData),
  ];

  const descriptorToMenuItem = (
    descriptor: RowActionDescriptor,
  ): DropdownMenuItem =>
    createMenuItem(
      descriptor.label,
      descriptor.icon,
      descriptor.onSelect,
      descriptor.color ? { color: descriptor.color } : undefined,
    );

  const createSortingMenuItems = (column: Column<T>): DropdownMenuItem[] => {
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

  const createPinningMenuItem = (
    column: Column<T>,
    isPinned: ColumnPinningPosition,
  ): DropdownMenuItem => {
    return createMenuItem(
      isPinned ? t("dms.table.unpin_column") : t("dms.table.pin_column"),
      isPinned ? "i-ph-push-pin" : "i-ph-push-pin-slash",
      () => column.pin(isPinned ? false : "left"),
    );
  };

  const createVisibilityMenuItem = (column: Column<T>): DropdownMenuItem => {
    return createMenuItem(t("dms.table.toggle_visibility"), "i-ph-eye", () =>
      column.toggleVisibility(),
    );
  };

  const createColumnHeader = (
    column: Column<T>,
    label: string,
    isPinned: ColumnPinningPosition,
    isSorted: false | SortDirection,
  ) => {
    const Icon = resolveComponent("Icon");

    const sortingItems = createSortingMenuItems(column);
    const visibilityItem = createVisibilityMenuItem(column);
    const pinningItem = createPinningMenuItem(column, isPinned);

    const menuItems = createMenuItems(
      ...sortingItems,
      visibilityItem,
      createSeparator(),
      pinningItem,
    );

    return h(
      "div",
      {
        class: config.ui.value.headCellInternal(),
      },
      [
        h("div", { class: "flex items-center gap-1" }, [
          h("span", label),
          isSorted
            ? h(Icon, {
                name: SORT_DIRECTION_ICON[isSorted],
                class: config.ui.value.columnActiveSortIcon(),
              })
            : null,
        ]),
        h(
          DropdownMenu as Component,
          {
            items: menuItems,
          },
          {
            default: () =>
              h(Button, {
                id: `col-header-${column.id}`,
                icon: appConfig.ui.icons.ellipsis,
                variant: ButtonVariant.ghost,
                size: Size.small,
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

  return {
    columns,
    columnInfos,
  };
};
