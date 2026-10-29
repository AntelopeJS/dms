import type { FormContainer, FormPageUrls } from "./useTableViewConfig";
import type { FormProps } from "../../../composables/form/types";
import type {
  QueryParamFilters,
  TableViewColumn,
} from "../../../composables/table-view/types";
import type { RowNavigationSource } from "../actions/rowNavigation";
import type { TableUrlScope } from "./utils/views";
import type { BulkActionKind } from "./utils/bulkActions";
import type { ConfirmOptions } from "../../../composables/confirm/types";
export interface TableRowActionsConfig {
  api: ReturnType<typeof $fetch.create>;
  location: string;
  /** The columns, whose labels name the fields a refused write lacks. */
  columns: ReadonlyArray<Pick<TableViewColumn, "accessorKey" | "header">>;
  caption?: string;
  labelKey?: string;
  rowIdKey?: string;
  refreshCallback?: () => void;
  formComponents: {
    new?: ComponentInfo<FormProps>;
    edit?: ComponentInfo<FormProps>;
    view?: ComponentInfo<FormProps>;
  };
  formContainer?: FormContainer;
  formPages?: FormPageUrls;
  routeParams?: Record<string, string>;
  componentId: string;
  pageId: string;
  queryParamFilters?: QueryParamFilters;
  /** The rows a row's drawer or modal steps through (J / K). */
  rowNavigation?: RowNavigationSource;
  /** Where a `deepLink` action writes its open row in the URL. */
  recordScope?: TableUrlScope;
  /** Told the row a `deepLink` action shows, `undefined` once closed. */
  onRecordShown?: (id?: string) => void;
}

export interface BulkActionConfig {
  kind: BulkActionKind;
  method: HttpMethod;
  queryKey: string;
  successKey: string;
  errorKey: string;
}

/** Runs a confirmed action from inside its dialog (see `onConfirm`). */
export type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;

/** Options of a delete: from the archive, it is a permanent one. */
export interface DeleteRowsOptions {
  permanently?: boolean;
  /**
   * The rows deleted, when the caller holds them: a dialog naming the row
   * (`{name}`) reads its fields here first. A kanban card is not among the
   * rows the table shows.
   */
  rows?: Data[];
}

export interface TableRowActionServices {
  toast: ReturnType<typeof useToast>;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
  confirm: ReturnType<typeof useConfirm>["confirm"];
  confirmAction: ReturnType<
    typeof import("../confirm/useActionConfirm").useActionConfirm
  >["confirmAction"];
  processI18n: ReturnType<typeof useTranslation>["processI18n"];
  openModal: ReturnType<typeof useModal>["open"];
  openDrawer: ReturnType<typeof useDrawer>["open"];
  route: ReturnType<typeof useDmsRoute>;
}
