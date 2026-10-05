import type {
  FormContainer,
  FormPageUrls,
} from "../../../build/composables/table-view/useTableViewConfig";
import type { TableViewColumn } from "./column";
import type { TableViewDisplayCapabilities } from "./display";
import type { CustomButton } from "./custom-button";
import type { FormProps } from "../../form/types";
import type { TableProps, TableFilter } from "../../../types/table";
import type { BlockAction } from "../../../components/blocks/BlockActions.vue";

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
  /** Filter the tab applies, on one column (a link tab has none). */
  filter?: TableFilter;
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

/** A figure of the footer band (backend `footer.summary`). */
export interface TableViewFooterSummaryConfig {
  /** Id the `summary` route computes it under. */
  id: string;
  label: string;
  field?: string;
  op: "sum" | "count";
  /** `Intl.NumberFormat` options; left out, a sum reads like its cells. */
  format?: Intl.NumberFormatOptions;
}

/**
 * How the rows beyond the first page are reached (backend `pagination`): a
 * pager, a "Load more" button, or more rows as the list's end shows.
 */
export type TableViewPaginationMode = "pages" | "loadMore" | "infinite";

/** Texts and figures of the footer band (backend `footer`). */
export interface TableViewFooter {
  /** i18n key (`$`) receiving `{ count }`, pluralized on it. */
  countLabel?: string;
  hint?: string;
  summary?: TableViewFooterSummaryConfig[];
  /** A select column whose items the footer lists as a legend. */
  legend?: string;
}

/** What an empty body says for one reason (backend `TableViewEmptyState`). */
export interface TableViewEmptyStateConfig {
  title: string;
  description?: string;
  icon?: string;
  actions?: BlockAction[];
  /** Draws the whole state; receives `state`, `search` and `refresh`. */
  component?: ComponentInfo;
}

/** Why a table's body is empty. */
export type TableViewEmptyStateKind = "firstRun" | "filtered" | "error";

/** The empty states of a table view (backend `emptyStates`). */
export type TableViewEmptyStatesConfig = Partial<
  Record<TableViewEmptyStateKind, TableViewEmptyStateConfig>
>;

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

/** A sort a view applies (backend `TableViewSort`). */
export interface TableViewViewSort {
  field: string;
  desc?: boolean;
}

/** The columns a view shows and their order (backend `columns`). */
export interface TableViewViewColumns {
  visible?: string[];
  hidden?: string[];
  order?: string[];
}

/** What a view sets on the table (backend `TableViewViewState`). */
export interface TableViewViewStateConfig {
  filters?: TableFilter[];
  search?: string;
  sort?: TableViewViewSort[];
  columns?: TableViewViewColumns;
  display?: string;
  density?: "default" | "compact";
}

/** A named state of the table (backend `TableViewView`). */
export interface TableViewViewConfig extends TableViewViewStateConfig {
  id: string;
  label: string;
  icon?: string;
  /** Colors the view's icon and counter. */
  tone?: string;
  /** Status dot before the label. */
  dot?: string;
  /** Shows the view's row count. */
  count?: boolean;
}

/** Where the views are drawn (backend `TableViewViewsLayout`). */
export type TableViewViewsLayout = "tabs" | "strip" | "menu";

/** The views of a table view (backend `views` option). */
export interface TableViewViewsConfig {
  items: TableViewViewConfig[];
  layout?: TableViewViewsLayout;
  defaultView?: string;
  /** Users may save the current state as a view of their own. */
  userViews?: boolean;
}

/** How the `grouped` display cuts the rows (backend `TableViewGroupBy`). */
export type TableViewGroupBy = "value" | "day" | "week";

/** The `grouped` display's options (backend `grouped`). */
export interface TableViewGroupedConfig {
  groupByField: string;
  by?: TableViewGroupBy;
  collapsible?: boolean;
  count?: boolean;
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
    "columns" | "displays" | "chrome" | "quickFilters" | "footer"
  > {
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
  /** How the rows beyond the first page are reached. */
  pagination?: TableViewPaginationMode;
  /**
   * Row density while the user picked none in the ⋯ menu: `compact` gives
   * 36px rows under a 32px header band.
   */
  density?: "default" | "compact";
  footer?: TableViewFooter;
  /** What the empty body says, per reason it is empty. */
  emptyStates?: TableViewEmptyStatesConfig;
  /** Named states of the table, opened from a strip, tabs or a menu. */
  views?: TableViewViewsConfig;
  /** Key of the table view in its page, prefixing its URL keys. */
  tableId?: string;
  /** The page carries no other table view: `?view=` / `?tab=` are its own. */
  isSoleTableView?: boolean;
}
