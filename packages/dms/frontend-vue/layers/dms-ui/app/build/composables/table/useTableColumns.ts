import type {
  Column,
  ColumnMeta,
  ColumnPinningPosition,
  SortDirection,
  Table,
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
import {
  ACTIONS_COLUMN_ID,
  EXPAND_COLUMN_ID,
  SELECT_COLUMN_ID,
} from "./constants";
import {
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "../table-view/types";
import {
  fillFormPageUrl,
  type FormContainer,
  type FormPageUrls,
} from "../table-view/useTableViewConfig";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";
import { useActionConfirm } from "../confirm/useActionConfirm";
import {
  type DefaultSortConfig,
  type HeaderSortCue,
  headerSortCue,
  isDefaultSorting,
} from "../table-view/utils/sortableColumns";

const SORT_DIRECTION_ICON: Record<SortDirection, string> = {
  asc: "i-ph-arrow-up",
  desc: "i-ph-arrow-down",
};

// v2 sortable header: the label is the sort button. Its sort icon is always
// drawn (touch has no hover), in the same 12px box whatever its state, so the
// header never shifts: a neutral ↕ until sorted, the default sort's arrow in
// neutral grey, the user's sort arrow in accent with an emphasised title.
// A column that cannot be sorted shows its title alone.
const SORTABLE_LABEL_CLASS =
  "group/sort -mx-1.5 inline-flex min-w-0 cursor-pointer items-center gap-1 rounded-[5px] px-1.5 py-[3px] uppercase transition-colors hover:bg-elevated hover:text-default";
// A label wider than its column ends in an ellipsis and reads in full in its
// tooltip.
const HEADER_LABEL_CLASS = "truncate";
// The header font is monospaced: the bolder title keeps its width.
const SORTABLE_LABEL_ACTIVE_CLASS = "font-bold text-highlighted";
const SORT_IDLE_ICON = "i-ph-caret-up-down";
const SORT_ICON_BOX_CLASS = "inline-flex size-3 shrink-0";
const SORT_IDLE_ICON_CLASS =
  "size-3 shrink-0 text-dimmed transition-colors group-hover/sort:text-highlighted";
const SORT_DEFAULT_ICON_CLASS =
  "size-3 shrink-0 text-muted transition-colors group-hover/sort:text-highlighted";

const ACTIONS_COLUMN_BASE_SIZE = 55;
const ACTIONS_COLUMN_BUTTON_SIZE = 36;
// Measured footprints of an actions cell holding labelled buttons: the cell
// gutters, a square icon button, the gap between buttons, and a labelled
// button (padding, plus its icon) with ~6.5px a character.
const ACTIONS_CELL_GUTTERS = 28;
const ACTIONS_ICON_BUTTON_SIZE = 24;
const ACTIONS_BUTTON_GAP = 4;
const ACTIONS_LABEL_PADDING = 20;
const ACTIONS_LABEL_ICON_SIZE = 16;
const ACTIONS_LABEL_CHAR_SIZE = 6.5;
// Room for the labelled "Restore" button archived rows show inline.
const ACTIONS_COLUMN_RESTORE_SIZE = 64;

// Same footprint as the selection column: 24px button plus the row gutters.
const EXPAND_COLUMN_SIZE = 52;
const EXPAND_ICON_CLASS = "size-4 transition-transform duration-200";
const EXPAND_ICON_OPEN_CLASS = "rotate-90";
const EXPAND_BUTTON_CLASS =
  "text-dimmed hover:text-highlighted group-data-[expanded=true]:text-highlighted";

const RIGHT_ALIGNED_HEADER_CLASS = "flex-row-reverse";
const RIGHT_ALIGNED_LABEL_CLASS = "flex-row-reverse";

const BUILTIN_ROW_ACTION_KEYS = [
  "copyLink",
  "details",
  "edit",
  "duplicate",
  "delete",
  "archive",
  "restore",
] as const;

// Destructive actions close the row menu, after a separator (v2 row menu).
const DESTRUCTIVE_ROW_ACTION_KEYS = new Set(["delete", "archive", "restore"]);

interface RowActionDescriptor {
  /** Built-in action key; custom actions have none. */
  key?: (typeof BUILTIN_ROW_ACTION_KEYS)[number];
  label: string;
  icon: string;
  onSelect: () => void;
  disabled: boolean;
  color?: Color;
  visible: boolean;
  /** Inline button variant (custom actions); ghost otherwise. */
  variant?: ButtonVariant;
  /** The inline button shows its label. */
  showLabel?: boolean;
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
  formPages?: FormPageUrls;
  routeParams?: Record<string, string>;
  onCustomRowAction?: (action: CustomRowAction, rowData: T) => void;
  expandable?: boolean;
  expandedRowDomId?: (rowId: string) => string;
  showArchived?: Ref<boolean>;
  /** Column header menus (sort, hide, pin). Defaults to true. */
  columnMenus?: boolean;
  /** The table's default sort: its column shows a neutral arrow. */
  defaultSort?: DefaultSortConfig;
}

interface ExtendedColumnMeta<T> extends ColumnMeta<T, unknown> {
  label?: string;
  /** Right-aligned columns (amounts) put the sort arrow before the label. */
  align?: "right";
}

export const useTableColumns = <T extends Data>(config: ColumnConfig<T>) => {
  const { t } = useI18n();
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

  const { renderColumnValue, isNumericColumn } = useColumnValueRenderer();

  // A typed column draws its cells through its data type's formatter (or the
  // one its `display` names), which also receives the row.
  const buildTypedCell =
    (col: TableColumn<T>) =>
    ({ row }: { row: { original: T } }) =>
      renderColumnValue(col, row.original as Record<string, unknown>);

  const buildHeaderRenderer = (label: string) => {
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
      return createColumnHeader(column, label, isPinned, isSorted, cue);
    };
  };

  const processColumn = (col: TableColumn<T>): TableColumn<T> => {
    if (!col.id && "accessorKey" in col) {
      col.id = col.accessorKey as string;
    }

    if (!isString(col.header) || col.id === ACTIONS_COLUMN_ID) {
      return col;
    }

    if (col.type || col.display) {
      col.cell = buildTypedCell(col);
    }

    const label = col.header;
    if (!col.meta) {
      col.meta = {} as ExtendedColumnMeta<T>;
    }
    (col.meta as ExtendedColumnMeta<T>).label = label;
    if (isNumericColumn(col)) {
      (col.meta as ExtendedColumnMeta<T>).align = "right";
    }

    col.header = buildHeaderRenderer(label);
    return col;
  };

  const columns = computed(() => {
    const processedColumns = [...columnInfos].map(processColumn);

    addExpandColumn(processedColumns);
    addRowSelectionColumn(processedColumns);
    addRowActionsColumn(processedColumns);

    return processedColumns;
  });

  // Caret column in front of the content: rotates a quarter turn while the
  // row's detail band is open.
  const addExpandColumn = (columns: TableColumn<T>[]) => {
    if (!config.expandable) return;

    columns.unshift({
      id: EXPAND_COLUMN_ID,
      size: EXPAND_COLUMN_SIZE,
      enableColumnFilter: false,
      enableSorting: false,
      // Named for assistive technologies only: the column holds the carets.
      header: () => h("span", { class: "sr-only" }, t("dms.table.expand_row")),
      cell: ({ row }) => {
        const isExpanded = row.getIsExpanded();
        return h(
          Button,
          {
            "aria-label": isExpanded
              ? t("dms.table.collapse_row")
              : t("dms.table.expand_row"),
            "aria-expanded": isExpanded,
            "aria-controls": isExpanded
              ? config.expandedRowDomId?.(row.id)
              : undefined,
            color: Color.neutral,
            variant: ButtonVariant.ghost,
            size: Size.tiny,
            square: true,
            class: EXPAND_BUTTON_CLASS,
            onClick: (event: Event) => {
              event.stopPropagation();
              row.toggleExpanded();
            },
            onDblclick: (event: Event) => event.stopPropagation(),
          },
          {
            leading: () =>
              h(resolveComponent("Icon"), {
                name: appConfig.ui.icons.chevronRight,
                class: [
                  EXPAND_ICON_CLASS,
                  isExpanded && EXPAND_ICON_OPEN_CLASS,
                ],
              }),
          },
        );
      },
    });
  };

  const addRowSelectionColumn = (columns: TableColumn<T>[]) => {
    const hasBulkAction =
      normalizeActionConfig(config.rowActions?.delete).isEnabled ||
      normalizeActionConfig(config.rowActions?.archive).isEnabled ||
      normalizeActionConfig(config.rowActions?.restore).isEnabled ||
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
      if (isCustomActionInline(action)) count++;
    }
    return count;
  };

  const inlineButtonSize = (descriptor: RowActionDescriptor): number =>
    descriptor.showLabel
      ? ACTIONS_LABEL_PADDING +
        (descriptor.icon ? ACTIONS_LABEL_ICON_SIZE : 0) +
        descriptor.label.length * ACTIONS_LABEL_CHAR_SIZE
      : ACTIONS_ICON_BUTTON_SIZE;

  const hasLabelledInlineActions = (): boolean =>
    (config.rowActions?.custom || []).some(
      (action) => isCustomActionInline(action) && action.showLabel,
    );

  // The buttons a row shows, side by side, with its menu trigger.
  const actionsCellWidth = (descriptors: RowActionDescriptor[]): number => {
    const inline = descriptors.filter((d) => d.visible);
    const buttons =
      inline.length + (descriptors.length > inline.length ? 1 : 0);
    const width =
      inline.reduce((sum, d) => sum + inlineButtonSize(d), 0) +
      (descriptors.length > inline.length ? ACTIONS_ICON_BUTTON_SIZE : 0) +
      Math.max(buttons - 1, 0) * ACTIONS_BUTTON_GAP;
    return ACTIONS_CELL_GUTTERS + width;
  };

  // Labelled buttons are sized on the rows listed when the table opens: rules
  // often make inline actions exclusive (revoke a pending invitation, remove
  // an expired one), so the widest row decides rather than their sum.
  const labelledActionsColumnSize = (): number => {
    const rows = config.data.value;
    if (rows.length === 0) {
      return actionsCellWidth(buildRowActionDescriptors({} as T));
    }
    return Math.max(
      ...rows.map((row) =>
        actionsCellWidth(
          buildRowActionDescriptors(row).filter(
            (d) => !d.disabled && !isOffMode(d),
          ),
        ),
      ),
    );
  };

  const renderActionButton = (descriptor: RowActionDescriptor, rowId: string) =>
    h(Button, {
      id: `row-action-${rowId}-${descriptor.icon || descriptor.label}`,
      "aria-label": descriptor.label,
      title: descriptor.showLabel ? undefined : descriptor.label,
      label: descriptor.showLabel ? descriptor.label : undefined,
      icon: descriptor.icon,
      color: descriptor.color || Color.neutral,
      variant: descriptor.variant ?? ButtonVariant.ghost,
      size: Size.tiny,
      onClick: (event: Event) => {
        event.stopPropagation();
        descriptor.onSelect();
      },
    });

  const renderActionsDropdown = (
    items: DropdownMenuItem[] | DropdownMenuItem[][],
    rowId: string,
  ) =>
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
      config.rowActions?.archive,
      config.rowActions?.restore,
    ].some((flag) => normalizeActionConfig(flag).isEnabled);

    const hasCustomActions =
      !!config.rowActions?.custom && config.rowActions.custom.length > 0;

    return builtInEnabled || hasCustomActions;
  };

  // Archived rows put "Restore" up front as a labelled button.
  const renderRestoreButton = (
    descriptor: RowActionDescriptor,
    rowId: string,
  ) =>
    h(Button, {
      id: `row-action-${rowId}-restore`,
      label: descriptor.label,
      icon: descriptor.icon,
      color: Color.neutral,
      variant: ButtonVariant.ghost,
      size: Size.tiny,
      onClick: (event: Event) => {
        event.stopPropagation();
        descriptor.onSelect();
      },
    });

  const isShowingArchived = () => config.showArchived?.value === true;

  // The backend serializes `isVisible`; `visible` is the former spelling.
  const isCustomActionInline = (action: CustomRowAction): boolean =>
    action.isVisible === true || action.visible === true;

  const { confirmAction } = useActionConfirm();

  const normalizedConfigOf = (key: string): RowActionConfig | undefined => {
    const actionConfig = config.rowActions?.[
      key as keyof TableRowActionOptions
    ] as boolean | RowActionConfig | undefined;
    return typeof actionConfig === "object" ? actionConfig : undefined;
  };

  // Archive acts on active rows, restore on archived ones (archive mode only;
  // without the toggle both stay as configured).
  const isOffMode = (descriptor: RowActionDescriptor): boolean => {
    if (!config.showArchived) return false;
    return isShowingArchived()
      ? descriptor.key === "archive"
      : descriptor.key === "restore";
  };

  const renderActionsCell = (row: { original: T; id: string }) => {
    const descriptors = buildRowActionDescriptors(row.original).filter(
      (d) => !d.disabled && !isOffMode(d),
    );
    const restoreDescriptor = isShowingArchived()
      ? descriptors.find((d) => d.key === "restore")
      : undefined;
    const visibleDescriptors = descriptors.filter(
      (d) => d.visible && d !== restoreDescriptor,
    );
    const menuDescriptors = descriptors.filter(
      (d) => !d.visible && d !== restoreDescriptor,
    );
    // Destructive entries close the menu, after a separator.
    const dropdownItems = [
      menuDescriptors
        .filter((d) => !isDestructive(d))
        .map(descriptorToMenuItem),
      menuDescriptors.filter(isDestructive).map(descriptorToMenuItem),
    ].filter((group) => group.length > 0);

    if (
      !restoreDescriptor &&
      visibleDescriptors.length === 0 &&
      dropdownItems.length === 0
    ) {
      return null;
    }

    const children = visibleDescriptors.map((d) =>
      renderActionButton(d, row.id),
    );
    if (restoreDescriptor) {
      children.unshift(renderRestoreButton(restoreDescriptor, row.id));
    }
    if (dropdownItems.length > 0) {
      children.push(renderActionsDropdown(dropdownItems, row.id));
    }

    return h(
      "div",
      {
        // Labelled buttons are the row's actions on show: never faded.
        class: config.ui.value.rowAction({
          prominent: visibleDescriptors.some((d) => d.showLabel),
        }),
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
    const restoreRoom =
      config.showArchived &&
      normalizeActionConfig(config.rowActions?.restore).isEnabled
        ? ACTIONS_COLUMN_RESTORE_SIZE
        : 0;
    const columnSize =
      (hasLabelledInlineActions()
        ? labelledActionsColumnSize()
        : ACTIONS_COLUMN_BASE_SIZE +
          visibleActionCount * ACTIONS_COLUMN_BUTTON_SIZE) + restoreRoom;

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
    const viewPageUrl =
      containerType === FormContainerType.page
        ? config.formPages?.view
        : undefined;
    if (viewPageUrl) {
      const itemId = get(rowData, config.rowIdKey);
      itemUrl = `${window.location.origin}${fillFormPageUrl(viewPageUrl, config.routeParams, itemId)}`;
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

  // Copying a link asks first when the action declares a confirmation.
  const copyLinkAfterConfirm = async (rowData: T) => {
    const declared = normalizedConfigOf("copyLink")?.confirm;
    if (declared) {
      const isConfirmed = await confirmAction(declared, {
        row: rowData as Record<string, unknown>,
        urlParams: { id: get(rowData, config.rowIdKey) },
      });
      if (!isConfirmed) return;
    }
    await buildCopyLinkOnSelect(rowData)();
  };

  const buildCustomActionDescriptors = (rowData: T): RowActionDescriptor[] =>
    (config.rowActions?.custom || []).map((action) => ({
      label: processI18n(action.label),
      // A labelled button may go without an icon.
      icon: action.icon || (action.showLabel ? "" : "i-ph-lightning"),
      onSelect: () => config.onCustomRowAction?.(action, rowData),
      disabled: isCustomActionDisabled(action, rowData),
      visible: isCustomActionInline(action),
      color: action.color as Color | undefined,
      variant: action.variant as ButtonVariant | undefined,
      showLabel: action.showLabel,
    }));

  // A built-in action may carry its own label and icon ("Change roles").
  const builtInLabel = (key: string, fallback: string): string => {
    const label = normalizedConfigOf(key)?.label;
    return label ? processI18n(label) : fallback;
  };
  const builtInIcon = (key: string, fallback: string): string =>
    normalizedConfigOf(key)?.icon ?? fallback;

  const buildBuiltInActionDescriptors = (rowData: T): RowActionDescriptor[] => [
    {
      key: "copyLink",
      label: builtInLabel("copyLink", t("dms.button.copy_link")),
      icon: builtInIcon("copyLink", "i-ph-link"),
      onSelect: () => copyLinkAfterConfirm(rowData),
      disabled: isActionDisabled(config.rowActions?.copyLink, rowData),
      visible: isActionVisible(config.rowActions?.copyLink),
    },
    {
      key: "details",
      label: builtInLabel("details", t("dms.button.details")),
      icon: builtInIcon("details", "i-ph-info"),
      onSelect: () => config.emits("details", rowData),
      disabled: isActionDisabled(config.rowActions?.details, rowData),
      visible: isActionVisible(config.rowActions?.details),
    },
    {
      key: "edit",
      label: builtInLabel("edit", t("dms.button.edit")),
      icon: builtInIcon("edit", "i-ph-pencil"),
      onSelect: () => config.emits("edit", rowData),
      disabled: isActionDisabled(config.rowActions?.edit, rowData),
      visible: isActionVisible(config.rowActions?.edit),
    },
    {
      key: "duplicate",
      label: builtInLabel("duplicate", t("dms.button.duplicate")),
      icon: builtInIcon("duplicate", "i-ph-copy"),
      onSelect: () => config.emits("duplicate", get(rowData, config.rowIdKey)),
      disabled: isActionDisabled(config.rowActions?.duplicate, rowData),
      visible: isActionVisible(config.rowActions?.duplicate),
    },
    {
      key: "delete",
      label: builtInLabel("delete", t("dms.button.delete")),
      icon: builtInIcon("delete", "i-ph-trash"),
      onSelect: () => config.emits("delete", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.delete, rowData),
      visible: isActionVisible(config.rowActions?.delete),
      color: Color.error,
    },
    {
      key: "archive",
      label: builtInLabel("archive", t("dms.button.archive")),
      icon: builtInIcon("archive", "i-ph-archive"),
      onSelect: () => config.emits("archive", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.archive, rowData),
      visible: isActionVisible(config.rowActions?.archive),
    },
    {
      key: "restore",
      label: builtInLabel("restore", t("dms.button.restore")),
      icon: builtInIcon("restore", "i-ph-arrow-counter-clockwise"),
      onSelect: () => config.emits("restore", [get(rowData, config.rowIdKey)]),
      disabled: isActionDisabled(config.rowActions?.restore, rowData),
      visible: isActionVisible(config.rowActions?.restore),
    },
  ];

  // v2 row menu order: the row's own actions (open, edit, duplicate), the
  // custom ones, then the destructive ones after a separator.
  const buildRowActionDescriptors = (rowData: T): RowActionDescriptor[] => {
    const builtIns = buildBuiltInActionDescriptors(rowData);
    return [
      ...builtIns.filter((d) => !isDestructive(d)),
      ...buildCustomActionDescriptors(rowData),
      ...builtIns.filter(isDestructive),
    ];
  };

  const isDestructive = (descriptor: RowActionDescriptor): boolean =>
    !!descriptor.key && DESTRUCTIVE_ROW_ACTION_KEYS.has(descriptor.key);

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

  const isRightAligned = (column: Column<T>): boolean =>
    (column.columnDef.meta as ExtendedColumnMeta<T> | undefined)?.align ===
    "right";

  // Same cycle as the toolbar sort menu: ascending, descending, then off. The
  // list route sorts on one column, so a new column replaces the current sort.
  const cycleSorting = (column: Column<T>, isSorted: false | SortDirection) => {
    if (isSorted === "desc") {
      column.clearSorting();
      return;
    }
    column.toggleSorting(isSorted === "asc", false);
  };

  const renderSortIcon = (
    cue: HeaderSortCue,
    isSorted: false | SortDirection,
    Icon: ReturnType<typeof resolveComponent>,
  ) => {
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

  const renderSortableLabel = (
    column: Column<T>,
    label: string,
    isSorted: false | SortDirection,
    cue: HeaderSortCue,
    Icon: ReturnType<typeof resolveComponent>,
  ) => {
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
        renderSortIcon(cue, isSorted, Icon),
        cue === "default" &&
          h("span", { class: "sr-only" }, t("dms.sort.default_sort")),
      ],
    );
  };

  const createColumnHeader = (
    column: Column<T>,
    label: string,
    isPinned: ColumnPinningPosition,
    isSorted: false | SortDirection,
    cue: HeaderSortCue,
  ) => {
    const Icon = resolveComponent("Icon");

    // Without column menus the header is its sortable label alone.
    if (config.columnMenus === false) {
      return h(
        "div",
        {
          class: [
            config.ui.value.headCellInternal(),
            isRightAligned(column) && RIGHT_ALIGNED_HEADER_CLASS,
          ],
        },
        [renderSortableLabel(column, label, isSorted, cue, Icon)],
      );
    }

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
        class: [
          config.ui.value.headCellInternal(),
          isRightAligned(column) && RIGHT_ALIGNED_HEADER_CLASS,
        ],
      },
      [
        renderSortableLabel(column, label, isSorted, cue, Icon),
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

  return {
    columns,
    columnInfos,
  };
};
