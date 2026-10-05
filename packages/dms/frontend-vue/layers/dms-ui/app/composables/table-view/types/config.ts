import type {
  FormContainer,
  FormPageUrls,
} from "../../../build/composables/table-view/useTableViewConfig";
import type { TableViewFormTexts } from "../../../build/composables/table-view/utils/formTexts";
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
  /** Link tab: path of the page it opens (no filter applied). */
  to?: string;
  /** Full id of the page a link tab opens, when it is a registered page. */
  toPage?: string;
  /** Data API location whose row total a link tab shows. */
  countFrom?: string;
  /** Publish the tab's counter as the nav badge of the page it stands for. */
  badge?: boolean;
}

/**
 * How much a table draws around its rows (backend `layout`): the full
 * dashboard grid, or the compact list of a settings page.
 */
export type TableViewLayout = "full" | "compact";

/** A one-click dropdown filter of the toolbar (backend `quickFilters`). */
export interface TableViewQuickFilter {
  field: string;
  label?: string;
  icon?: string;
  allLabel?: string;
  mode?: TableViewQuickFilterMode;
}

/** How a quick filter compares the column with the picked value. */
export type TableViewQuickFilterMode =
  | "is"
  | "is_not"
  | "include"
  | "exclude"
  | "array_contains_string";

/** Texts of the footer band (backend `footer`). */
export interface TableViewFooter {
  /** i18n key (`$`) receiving `{ count }`, pluralized on it. */
  countLabel?: string;
  hint?: string;
}

/** A field of the expanded row's detail band. */
export interface TableViewExpandableField {
  /** Column key; the value renders through that column's data type. */
  key: string;
  /** Label shown instead of the column's name (`$`-prefixed: i18n key). */
  label?: string;
}

/**
 * Expandable rows (backend `expandable` option): a caret column opens a
 * detail band under the row, listing `fields` or rendering `component` (which
 * receives `row`, `columns` and `rowId` and replaces the field list).
 */
export interface TableViewExpandableConfig {
  fields?: TableViewExpandableField[];
  fieldsLabel?: string;
  component?: ComponentInfo;
  /** Rows open on arrival and after the listed set changes. */
  defaultExpanded?: "none" | "first" | "all";
  /** At most one row open at a time. */
  single?: boolean;
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
  extends Omit<
    TableProps<T>,
    "columns" | "displays" | "chrome" | "quickFilters"
  > {
  location: string;
  enableTableExport?: boolean;
  archiveMode?: boolean;
  defaultFilters?: TableFilter[];
  columns: TableViewColumn[];
  labelKey?: string;
  /** Titles and descriptions of the add, edit and details forms. */
  formTexts?: TableViewFormTexts;
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
  /** Expandable rows: caret column + detail band. */
  expandable?: TableViewExpandableConfig;
  /** How much the table draws around its rows. */
  layout?: TableViewLayout;
  /** The controller declares `@Searchable` fields. */
  searchable?: boolean;
  searchPlaceholder?: string;
  quickFilters?: TableViewQuickFilter[];
  /** Rows per page while the user picked none. */
  pageSize?: number;
  /**
   * Row density while the user picked none in the ⋯ menu: `compact` gives
   * 36px rows under a 32px header band.
   */
  density?: "default" | "compact";
  footer?: TableViewFooter;
}
