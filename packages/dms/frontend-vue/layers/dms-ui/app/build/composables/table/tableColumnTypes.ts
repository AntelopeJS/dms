import type { Column } from "@tanstack/vue-table";
import type {
  Data,
  TableColumn,
  TableEmits,
  TableRowActionOptions,
} from "../../components/table/Table.vue";
import type { UseClipboardReturn } from "@vueuse/core";
import type {
  FormContainer,
  FormPageUrls,
} from "../table-view/useTableViewConfig";
import type { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";
import type { useActionConfirm } from "../confirm/useActionConfirm";
import type { DefaultSortConfig } from "../table-view/utils/sortableColumns";
import type { BUILTIN_ROW_ACTION_KEYS } from "./tableColumnActionDescriptors";
export interface RowActionDescriptor {
  /** Built-in action key; custom actions have none. */
  key?: (typeof BUILTIN_ROW_ACTION_KEYS)[number];
  label: string;
  icon: string;
  onSelect: () => void;
  disabled: boolean;
  color?: CustomRowAction["color"];
  visible: boolean;
  /** Inline button variant (custom actions); ghost otherwise. */
  variant?: CustomRowAction["variant"];
  /** The inline button shows its label. */
  showLabel?: boolean;
}

export interface LabeledColumn<T> {
  label: string;
  column: Column<T>;
}

type StyleSlot = (options?: {
  rowSelected?: boolean;
  prominent?: boolean;
}) => string;

export interface TableStyleSlots {
  headCellInternal: StyleSlot;
  rowAction: StyleSlot;
  rowSelection: StyleSlot;
  colOptionsTrigger: StyleSlot;
  columnActiveSortIcon: StyleSlot;
  [key: string]: StyleSlot;
}

export interface ColumnConfig<T> {
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
  /** Field naming a row: the default name of its ⋯ menu button. */
  labelKey?: string;
}

export interface TableColumnContext<T extends Data> {
  config: ColumnConfig<T>;
  t: ReturnType<typeof useI18n>["t"];
  router: ReturnType<typeof useDmsRouter>;
  toast: ReturnType<typeof useToast>;
  appConfig: ReturnType<typeof useDmsAppConfig>;
  copyToClipboard: UseClipboardReturn<false>["copy"];
  renderColumnValue: ReturnType<
    typeof useColumnValueRenderer
  >["renderColumnValue"];
  isNumericColumn: ReturnType<typeof useColumnValueRenderer>["isNumericColumn"];
  confirmAction: ReturnType<typeof useActionConfirm>["confirmAction"];
  processI18n: ReturnType<typeof useTranslation>["processI18n"];
}
