import type {
  FormContainer,
  FormPageUrls,
} from "../../../build/composables/table-view/useTableViewConfig";
import type { TableViewColumn } from "./column";
import type { TableViewDisplayCapabilities } from "./display";
import type { CustomButton } from "./custom-button";
import type { FormProps } from "../../form/types";
import type { TableProps, TableFilter } from "../../../types/table";

export interface QueryParamFilter {
  field: string;
  mode?: string;
}

export type QueryParamFilters = Record<string, QueryParamFilter>;

export interface RouteParamFilter {
  field: string;
  mode?: string;
}

export type RouteParamFilters = Record<string, RouteParamFilter>;

export interface TableViewTab {
  id: string;
  label: string;
  filters: TableFilter[];
  icon?: string;
  textColor?: string;
  iconColor?: string;
}

export interface TableViewListResponse<T> {
  results: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface KanbanConfig {
  groupByField: string;
  cardFields?: string[];
  cardComponent?: ComponentInfo;
  draggable?: boolean;
  columnMaxHeight?: string;
}

/**
 * Declares that a table view instance offers a given display (by id), with
 * optional per-instance options and an optional explicit component reference.
 * The display *type* (id -> component, capabilities) is registered globally via
 * `registerTableViewDisplay`; this only opts an instance into it + configures it.
 */
export interface TableViewDisplayConfig {
  /** Matches a registered display id (e.g. "table", "kanban", "cards"). */
  id: string;
  /** Per-instance options forwarded to the display via `context.options`. */
  options?: Record<string, unknown>;
  /**
   * Optional component reference (resolved via `resolveDmsComponent`, SSR-safe).
   * When omitted, the registered display's component is used.
   */
  component?: ComponentInfo;
  /** SSR hint: when true the shared list query is skipped for this display. */
  selfManagedData?: boolean;
  /** Chrome shown for this display (SSR source of truth, see TableViewDisplayCapabilities). */
  capabilities?: TableViewDisplayCapabilities;
}

export interface TableViewConfig<T extends Data>
  extends Omit<TableProps<T>, "columns" | "displays"> {
  location: string;
  enableTableExport?: boolean;
  archiveMode?: boolean;
  defaultFilters?: TableFilter[];
  columns: TableViewColumn[];
  labelKey?: string;
  customButtons?: CustomButton[];
  formComponents: {
    new?: ComponentInfo<FormProps>;
    edit?: ComponentInfo<FormProps>;
    view?: ComponentInfo<FormProps>;
  };
  formContainer?: FormContainer;
  formPages?: FormPageUrls;
  componentId?: string;
  pageId?: string;
  defaultSort?: { field: string; desc?: boolean };
  queryParamFilters?: QueryParamFilters;
  routeParamFilters?: RouteParamFilters;
  routeParams?: Record<string, string>;
  tabs?: TableViewTab[];
  /** Displays this table view offers, beyond the implicit built-in `table`. */
  displays?: TableViewDisplayConfig[];
  /** Display shown by default when the user has no saved preference. Defaults to "table". */
  defaultDisplay?: string;
}
