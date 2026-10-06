import type { ControllerClass } from "@antelopejs/interface-api";
import type {
  ButtonPermission,
  Component,
  ComponentInfoSerialized,
} from "../../component";
import type { FormPropsSerialized } from "../form-types";
import type { BlockLinkAction } from "../display";
import type { Tone } from "../types/tone";
import type { ColorValue } from "../types";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { TableViewGuards } from "../types/guards";
import type {
  AddRowActionConfig,
  BulkRowActionConfig,
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfig,
  RowActionConfigSerialized,
  RowActionRule,
} from "../types/row-action";
import type { ModalSize } from "../types/size";
import type { TableViewSourceSerialized } from "./source";

export const DEFAULT_ROW_ID_FIELD = "_id";

/** The most rows a table lists per page, whoever picks the size. */
export const MAX_TABLE_PAGE_SIZE = 50;

export interface TableViewRowActionOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Delete action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'status', notEquals: 'completed' } }
   */
  delete?: boolean | BulkRowActionConfig<T>;
  /**
   * Archive action configuration
   */
  archive?: boolean | BulkRowActionConfig<T>;
  /**
   * Restore action configuration
   */
  restore?: boolean | BulkRowActionConfig<T>;
  /**
   * Duplicate action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'template', equals: true } }
   */
  duplicate?: boolean | RowActionConfig<T>;
  /**
   * Details/view action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'published', equals: true } }
   */
  details?: boolean | RowActionConfig<T>;
  /**
   * Edit action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'locked', equals: false } }
   */
  edit?: boolean | RowActionConfig<T>;
  /**
   * Copy link action configuration
   */
  copyLink?: boolean | RowActionConfig<T>;
  /**
   * Add/new row action configuration; `placement: "header"` draws its button
   * in the page header instead of the toolbar.
   */
  add?: boolean | AddRowActionConfig<T>;
  /**
   * Enable the row selection feature
   */
  hasSelection?: boolean;
  /**
   * Custom row actions
   */
  custom?: CustomRowAction<T>[];
}

export interface TableViewRowActionOptionsSerialized {
  delete?: boolean | RowActionConfigSerialized;
  archive?: boolean | RowActionConfigSerialized;
  restore?: boolean | RowActionConfigSerialized;
  showArchived?: boolean;
  duplicate?: boolean | RowActionConfigSerialized;
  details?: boolean | RowActionConfigSerialized;
  edit?: boolean | RowActionConfigSerialized;
  copyLink?: boolean | RowActionConfigSerialized;
  add?: boolean | RowActionConfigSerialized;
  hasSelection?: boolean;
  custom?: CustomRowActionSerialized[];
}

/** The filter a tab applies on one column. */
export interface TableViewTabFilter {
  /** Filterable column the tab filters on. */
  accessorKey: string;
  /** Value compared; a list of values is joined with commas. */
  value?: string;
  /** Compare mode, e.g. `"is"`. */
  mode: string;
}

/** A sort a view applies: the column, newest or largest first with `desc`. */
export interface TableViewSort {
  field: string;
  desc?: boolean;
}

/** The columns a view shows, and their order. */
export interface TableViewColumnsState {
  /** Columns shown, whatever their default visibility. */
  visible?: string[];
  /** Columns hidden, whatever their default visibility. */
  hidden?: string[];
  /**
   * Column order, left to right; the columns left out follow in their
   * declared order.
   */
  order?: string[];
}

/** Row height of a table: `compact` gives 36px rows under a 32px header. */
export type TableViewDensity = "default" | "compact";

/**
 * Everything a view sets on the table when it is opened. What a view leaves
 * out falls back to the table's defaults, so opening a view always shows the
 * same rows the same way.
 *
 * A filter value may hold tokens the server resolves for each request, so a
 * view's rows and its counter follow the caller and the clock:
 * `{{user.id}}` (the signed-in user's id), `{{now}}` and `{{now-7d}}` /
 * `{{now+14d}}` (the current instant, moved by whole days).
 */
export interface TableViewViewState {
  /** Filters on filterable columns, shown as the table's filter chips. */
  filters?: TableViewTabFilter[];
  /** Text typed in the search field. */
  search?: string;
  /** Sort of the rows; the list sorts on the first entry. */
  sort?: TableViewSort[];
  /** Columns shown and their order. */
  columns?: TableViewColumnsState;
  /**
   * Display the view opens in (`"table"`, `"kanban"`, `"grouped"`, a
   * module's `<module>:<id>`): it must be one the table offers.
   */
  display?: string;
  /** Row height of the grid. */
  density?: TableViewDensity;
}

/**
 * A named state of the table ("Past due > 7 days", "Mine"). Opening it
 * applies its state; the user may then change filters or sort, which marks
 * the view as modified with a way back (Reset) or forward (Save as new view).
 * A view the module declares is never overwritten.
 */
export interface TableViewView extends TableViewViewState {
  /** Stable id, used in the URL (`?view=<id>`). */
  id: string;
  /** `$`-prefixed: an i18n key. */
  label: string;
  icon?: string;
  /** Colors the view's icon and counter. */
  tone?: Tone;
  /** A status dot drawn before the label. */
  dot?: Tone;
  /**
   * Shows the number of rows the view lists, counted by the controller's
   * `countBatch` route like the tab counters.
   */
  count?: boolean;
  /**
   * Gate the view: one of the table's actions by name (e.g. `"export"`), or
   * an `Action` of any component.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the view requires; wins over `permission`. */
  permissionId?: string;
}

/** A view as it reaches the client. */
export type TableViewViewSerialized = Omit<
  TableViewView,
  "permission" | "permissionId"
>;

/**
 * Where the views are drawn: a tab strip above the table (`tabs`), a row of
 * pills above the status tabs (`strip`), or a menu button in the toolbar
 * (`menu`).
 */
export type TableViewViewsLayout = "tabs" | "strip" | "menu";

/** The views a table offers. */
export interface TableViewViewsOptions {
  /** The views the module declares, in order. */
  items: TableViewView[];
  /** Defaults to `tabs`. */
  layout?: TableViewViewsLayout;
  /**
   * View opened on arrival when the URL names none. Without it the table
   * opens in its own default state.
   */
  defaultView?: string;
  /**
   * Lets users save the current state as a view of their own ("Save as new
   * view"), and update or delete it. A user's views are kept with the rest
   * of their table preferences and are never shown to anyone else.
   */
  userViews?: boolean;
}

/** The views of a table as they reach the client. */
export interface TableViewViewsSerialized extends Omit<
  TableViewViewsOptions,
  "items"
> {
  items: TableViewViewSerialized[];
}

/**
 * A tab above the table: it filters the rows on one column (`filter`), or
 * opens another page (`to`) — never both, which registration refuses. A tab
 * with neither, given the id `"all"`, stands in for the implicit "all" tab, at
 * its own position, with its own label and icon.
 */
export interface TableViewTab {
  id: string;
  label: string;
  /** Hidden filter the tab applies, on a single column. */
  filter?: TableViewTabFilter;
  icon?: string;
  textColor?: ColorValue;
  iconColor?: ColorValue;
  /**
   * Turns the tab into a link to another page, typically a sibling list
   * (Members ↔ Invitations): a registered page controller, whose URL and
   * permission the tab follows, or a dashboard path.
   */
  to?: ControllerClass | string;
  /**
   * Gate the tab, a filter tab or a link tab: one of the table's actions by
   * name (e.g. `"list"`), or an `Action` of any component. A link tab to a
   * page controller follows that page's own permission without it.
   */
  permission?: ButtonPermission;
  /** Absolute permission id the tab requires; wins over `permission`. */
  permissionId?: string;
  /**
   * Data controller (or data API location, e.g. `"/api/tables/invites"`)
   * whose row total a link tab shows as its counter.
   */
  countFrom?: ControllerClass | string;
  /**
   * Publishes the tab's counter as the navigation badge of the page it
   * stands for, in the main navigation and the settings one: this table's
   * page for a filter tab, the linked page for a link tab (which then needs a
   * page controller `to` and a data controller `countFrom`). Counted on the
   * server when the menu loads, with the caller's own `list` permission; a
   * count of zero shows no badge.
   */
  navBadge?: boolean;
}

/** A tab as it reaches the client: link targets resolved to paths. */
export interface TableViewTabSerialized extends Omit<
  TableViewTab,
  "to" | "countFrom" | "permission" | "permissionId"
> {
  /** Path the link tab opens. */
  to?: string;
  /** Full id of the page a link tab opens, when it is a registered page. */
  toPage?: string;
  /** Data API location whose total the link tab shows. */
  countFrom?: string;
}

/**
 * How much a table draws around its rows.
 *
 * - `"full"`: the dashboard grid — caption and count, a search button,
 *   filters, sort, refresh, the ⋯ table menu, column header menus and a
 *   footer with the page size picker.
 * - `"compact"`: the list of a settings page — tabs, an always-open search
 *   field, quick filters and custom buttons; no caption, filters row, sort
 *   menu, refresh, ⋯ menu, column menus nor page size picker.
 *
 * Either way a control shows only when it means something: the search when
 * the controller has `@Searchable` fields, the filters when a column is
 * `filterable`, the caption when `caption` is set, the export entry when the
 * caller may export.
 */
export type TableViewLayout = "full" | "compact";

/** How a quick filter compares its column with the picked value. */
export type TableViewQuickFilterMode =
  | "is"
  | "is_not"
  | "include"
  | "exclude"
  | "array_contains_string";

/**
 * A one-click filter drawn in the toolbar as a dropdown button listing the
 * values of a column: a select's items, a boolean's two labels, or the rows
 * a relation points to. The picked value is the column's filter, the very one
 * the filters row edits: kept with the table's state, counted as an active
 * filter and cleared by "Reset filters". In the `compact` layout, which has
 * no filters row, the button names the column and its value ("Role: Admin")
 * next to a clear button.
 */
export interface TableViewQuickFilter {
  /** Filterable column the control filters on. */
  field: string;
  /** Button text while no value is picked; defaults to the column name. */
  label?: string;
  /** Button icon; defaults to a funnel. */
  icon?: string;
  /** Text of the entry that clears the filter; defaults to "All". */
  allLabel?: string;
  /**
   * Compare mode of the filter. Defaults to `array_contains_string` for a
   * multiple relation or select, `is` otherwise.
   */
  mode?: TableViewQuickFilterMode;
}

/**
 * How the rows beyond the first page are reached: a pager (`pages`), a
 * "Load more" button appending the next page (`loadMore`), or the next page
 * appended as the end of the list scrolls into view (`infinite`, a feed).
 */
export type TableViewPaginationMode = "pages" | "loadMore" | "infinite";

/**
 * Rows the user orders by hand: a drag handle (or the arrow keys on it)
 * moves a row, and the rows it moved get a new value of `field`. The handle
 * shows on the grid, to a caller who may edit the rows.
 */
export interface TableViewReorderOptions {
  /**
   * The number column holding a row's position, `@Sortable()` and
   * writable: the rows are listed sorted on it.
   */
  field: string;
}

/** What a footer summary computes over the rows the table lists. */
export type TableViewSummaryOperation = "sum" | "count";

/**
 * How a footer summary's figure reads, the options of `Intl.NumberFormat`
 * a backend can send. Left out, a sum reads like its column's cells (a
 * price as a price) and a count as a whole number.
 */
export interface TableViewSummaryFormat {
  style?: "decimal" | "percent" | "currency";
  /** ISO 4217 code, for the `currency` style. */
  currency?: string;
  notation?: "standard" | "compact";
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * A figure of the footer band ("MRR €12,480", "3 failed"), computed by the
 * server over every row the table's filters, search and tab list — not only
 * the page shown.
 */
export interface TableViewFooterSummary<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Shown before the figure. `$`-prefixed: an i18n key. */
  label: string;
  /** Column summed; required by `sum`. */
  field?: string;
  op: TableViewSummaryOperation;
  /**
   * Only the rows this rule accepts are summed or counted ("failed"). It
   * reads the stored fields of a row, in the database.
   */
  where?: RowActionRule<T>;
  format?: TableViewSummaryFormat;
}

/** A footer summary as it reaches the client: `where` stays on the server. */
export interface TableViewFooterSummarySerialized extends Omit<
  TableViewFooterSummary,
  "where"
> {
  /** Id the `summary` route computes it under. */
  id: string;
}

/** Texts and figures of the footer band. */
export interface TableViewFooterOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Row count text, an i18n key with `$` receiving `{ count }` and pluralized
   * on it ("7 members"). Defaults to "{count} items".
   */
  countLabel?: string;
  /** A hint at the right of the count. `$`-prefixed: an i18n key. */
  hint?: string;
  /**
   * Figures computed over the listed rows, next to the count. The
   * controller mounts `summary: TableViewRoutes.Summary` to serve them.
   */
  summary?: TableViewFooterSummary<T>[];
  /**
   * A `SelectType` column whose items, with their colors, the footer lists
   * as a legend.
   */
  legend?: string;
}

/** The footer band's options as they reach the client. */
export interface TableViewFooterSerialized extends Omit<
  TableViewFooterOptions,
  "summary"
> {
  summary?: TableViewFooterSummarySerialized[];
}

/**
 * What a table's empty body says for one reason it is empty, in place of the
 * built-in texts. Texts are `$`-prefixed i18n keys or literals; both receive
 * `{ search }`, the text searched. Action labels receive no parameter.
 */
export interface TableViewEmptyState {
  title: string;
  description?: string;
  icon?: string;
  /** Link buttons, after the ones the table adds itself. */
  actions?: BlockLinkAction[];
  /**
   * Frontend component drawing the whole state instead (a gallery of
   * templates), resolved by name from the global registry. It receives
   * `state` (`firstRun`, `filtered` or `error`), `search` and `refresh()`.
   */
  component?: Component;
}

/**
 * The empty states of a table: `firstRun` while it has no row yet (it keeps
 * the add button), `filtered` when its filters or search match nothing (it
 * keeps "Clear search", "Clear filters" or "Clear filters and search"),
 * `error` when the list failed (it keeps "Try again"). The grid and the
 * `cards` display draw them; the kanban board and a module's own display do
 * not.
 */
export interface TableViewEmptyStates {
  firstRun?: TableViewEmptyState;
  filtered?: TableViewEmptyState;
  error?: TableViewEmptyState;
}

/** An empty state as it reaches the client. */
export interface TableViewEmptyStateSerialized extends Omit<
  TableViewEmptyState,
  "component"
> {
  component?: ComponentInfoSerialized;
}

/** The empty states as they reach the client. */
export type TableViewEmptyStatesSerialized = Partial<
  Record<keyof TableViewEmptyStates, TableViewEmptyStateSerialized>
>;

/**
 * The card the `kanban` and `cards` displays draw for each row. Left out,
 * a card shows the row's label and its first few listable columns (on the
 * board, besides the one it groups on).
 */
export interface TableViewCardOptions {
  /**
   * Columns shown on the card below its title (`labelKey`), each value
   * rendered with its column's data type, like a cell.
   */
  fields?: string[];
  /**
   * Frontend component drawing the whole card, resolved by name from the
   * global registry; its directory must be declared globally. Both displays
   * hand it the same props: `row`, `rowId`, `columns`, `labelKey`, `actions`
   * (the table's row actions), `selected` and `select(value?)` (the row's
   * selection), and `open()` (what a click on the row does). The kanban adds
   * `groupValue`, the value of the column the card sits in.
   */
  component?: Component;
}

/** The card of the `kanban` and `cards` displays as it reaches the client. */
export interface TableViewCardOptionsSerialized {
  fields?: string[];
  component?: ComponentInfoSerialized;
}

/** The kanban options as its display entry carries them. */
export interface KanbanOptionsSerialized extends Omit<
  KanbanOptions,
  "card" | "cardFields" | "cardComponent"
> {
  card?: TableViewCardOptionsSerialized;
}

export interface TableViewDisplayCapabilities {
  columnManagement?: boolean;
  filters?: boolean;
  search?: boolean;
  sorting?: boolean;
  tabs?: boolean;
  /**
   * Whether the table keeps its own chrome (caption, toolbar, tabs, filters
   * row, bulk bar) around a display that draws a complete interface itself.
   * Defaults to true.
   */
  header?: boolean;
}

/**
 * A display a table view offers besides its grid: a built-in one by its id
 * (`"cards"`), or a module's, named `<module>:<id>` (`"saas:plan-cards"`) and
 * registered on the frontend with `registerTableViewDisplay`.
 */
export interface TableViewDisplayOption {
  id: string;
  options?: Record<string, unknown>;
  component?: Component;
  selfManagedData?: boolean;
  capabilities?: TableViewDisplayCapabilities;
}

export interface TableViewDisplayOptionSerialized extends Omit<
  TableViewDisplayOption,
  "component"
> {
  component?: ComponentInfoSerialized;
}

/** A field of the expanded row's detail band. */
export interface TableViewExpandableField {
  /** Column key; the value renders through that column's data type. */
  key: string;
  /** Label shown instead of the column's name. `$`-prefixed: an i18n key. */
  label?: string;
}

/** Which rows open on arrival and after the listed set changes. */
export type TableViewExpandedDefault = "none" | "first" | "all";

/** How expandable rows open, whatever their band shows. */
export interface TableViewExpandableBehavior {
  /**
   * Rows open when the table loads and whenever a new page, filter, search,
   * sort, tab or archive view is listed. Defaults to "none".
   */
  defaultExpanded?: TableViewExpandedDefault;
  /** Keep at most one row open: opening a row closes the previous one. */
  single?: boolean;
}

/** A detail band listing columns of the row as a label/value list. */
export interface TableViewExpandableFields extends TableViewExpandableBehavior {
  /**
   * Columns listed in the band, each value rendered with its column's data
   * type. A column must be listable to carry a value; hide it from the grid
   * with `isVisible: false` on its `@Column` to show it only here.
   */
  fields: Array<string | TableViewExpandableField>;
  /** Eyebrow above the field list. `$`-prefixed: an i18n key. */
  fieldsLabel?: string;
  component?: never;
}

/** A detail band drawn entirely by a frontend component. */
export interface TableViewExpandableComponent extends TableViewExpandableBehavior {
  /**
   * Frontend component rendered as the whole band, resolved by name from the
   * global registry. It receives `row` (the listed row), `columns` (the
   * table's column metadata) and `rowId`.
   */
  component: Component;
  fields?: never;
  fieldsLabel?: never;
}

/**
 * Expandable rows: a caret column opens a detail band under the row. The band
 * shows either `fields` as a label/value list, or a `component` that replaces
 * that rendering altogether — never both.
 */
export type TableViewExpandableOptions =
  | TableViewExpandableFields
  | TableViewExpandableComponent;

/** The detail band of expandable rows as it reaches the client. */
export interface TableViewExpandableSerialized extends TableViewExpandableBehavior {
  fields?: TableViewExpandableField[];
  fieldsLabel?: string;
  component?: ComponentInfoSerialized;
}

export interface TableViewOptionsSerialized extends Omit<
  TableViewOptions,
  | "customButtons"
  | "rowActions"
  | "kanban"
  | "displays"
  | "formSlots"
  | "expandable"
  | "tabs"
  | "views"
  | "footer"
  | "emptyStates"
> {
  enableTableExport: boolean;
  /** Whether the controller declares `@Searchable` fields to search in. */
  searchable: boolean;
  customButtons?: CustomButtonSerialized[];
  defaultFilters?: Array<{ accessorKey: string; value?: string; mode: string }>;
  rowActions?: TableViewRowActionOptionsSerialized;
  formComponents: Record<
    string,
    ComponentInfoSerialized<FormPropsSerialized> | undefined
  >;
  defaultSort?: { field: string; desc?: boolean };
  queryParamFilters?: QueryParamFilters;
  routeParamFilters?: RouteParamFilters;
  tabs?: TableViewTabSerialized[];
  displays?: TableViewDisplayOptionSerialized[];
  /**
   * Resolved page-mode form URLs. Server-computed, so the frontend navigates to
   * the very URLs the form sub-pages were registered under instead of rebuilding
   * them from the browser path. Absent when the container is not a page.
   */
  formPages?: TableViewFormPageUrls;
  expandable?: TableViewExpandableSerialized;
  views?: TableViewViewsSerialized;
  footer?: TableViewFooterSerialized;
  emptyStates?: TableViewEmptyStatesSerialized;
  /** Where a `TableView.fromSource` table reads its rows. */
  source?: TableViewSourceSerialized;
  /**
   * Key of the table view in its page, which prefixes its URL keys
   * (`?<tableId>.view=`). Set per request.
   */
  tableId?: string;
  /**
   * The table view is the only one its page carries: the short URL keys
   * (`?view=`, `?tab=`) are its own. Set per request.
   */
  isSoleTableView?: boolean;
}

/**
 * Heading texts of one of the forms a table view opens, whatever container
 * opens it: the page, drawer or modal title and the line under it. Left out,
 * the forms read "New entry", "Edit entry" and "Entry details".
 */
export interface FormContainerPageTexts {
  /** Title of the page, drawer or modal. `$`-prefixed: an i18n key. */
  displayName?: string;
  /** Line under the title. `$`-prefixed: an i18n key. */
  description?: string;
}

/** One form of a page-mode table view: its texts, and the page it opens on. */
export interface FormContainerPageConfig extends FormContainerPageTexts {
  urlSlug?: string;
  /**
   * When true, the DMS will not auto-create a form page for this action.
   * Use this when you have a manually registered page (via CustomComponent) at the same URL.
   * The urlSlug will still be used for navigation.
   */
  customPage?: boolean;
}

/** The forms a table view opens: add (`new`), edit and `details`. */
export interface FormContainerPages<
  Page extends FormContainerPageTexts = FormContainerPageConfig,
> {
  new?: Page;
  edit?: Page;
  details?: Page;
}

/**
 * Where the add, edit and details forms of a table view open, and their
 * titles: `pages` names them in every container ("New task", "Edit task",
 * "Task details"); a page-mode entry also sets the page's URL.
 */
export type FormContainer =
  | { type: "drawer"; pages?: FormContainerPages<FormContainerPageTexts> }
  | {
      type: "modal";
      size?: ModalSize;
      pages?: FormContainerPages<FormContainerPageTexts>;
    }
  | {
      type: "page";
      pages?: FormContainerPages;
    };

/**
 * Page-mode form URLs, resolved against the slug of the page the table view is
 * mounted on. They keep the `:id` placeholder of their slug: the frontend
 * substitutes the row id when it navigates.
 */
export interface TableViewFormPageUrls {
  new: string;
  edit: string;
  view: string;
}

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

/** Id of the built-in grid display. */
export const TABLE_DISPLAY_ID = "table";
/** Id of the built-in kanban display. */
export const KANBAN_DISPLAY_ID = "kanban";
/** Id of the built-in card grid display. */
export const CARDS_DISPLAY_ID = "cards";
/** Id of the built-in grouped display (see `grouped`). */
export const GROUPED_DISPLAY_ID = "grouped";

export interface KanbanOptions {
  /**
   * Field used to group cards into kanban columns. Must be declared as a
   * @Column with a non-multiple SelectType (one column per item), a
   * BooleanType (two columns), or a StatusType (one column per status). This
   * is the default; users can switch to any other eligible field from the
   * board.
   */
  groupByField: string;
  /**
   * @deprecated Use the table view's `card.fields`; this alias goes in 0.5.
   */
  cardFields?: string[];
  /**
   * @deprecated Use the table view's `card.component`, which receives the
   * card props (`row`, `actions`, `selected`, `open()`…); this alias goes in
   * 0.5.
   */
  cardComponent?: Component;
  /**
   * Allow dragging cards between columns to update the group field.
   * Defaults to true.
   */
  draggable?: boolean;
  /**
   * CSS max-height of a kanban column card list before it scrolls
   * (e.g. "60vh", "480px"). Defaults to "60vh". The number of items fetched
   * per column follows the user-adjustable table page size preference.
   */
  columnMaxHeight?: string;
}

/** How the `grouped` display cuts the rows into groups. */
export type TableViewGroupBy = "value" | "day" | "week";

/**
 * The `grouped` display: the table's own columns, with a header row before
 * each group of rows sharing a value of `groupByField` (a status, a day of a
 * date). The rows are listed sorted on that column and paged as usual, and a
 * page starting inside a group repeats its header on top. No aggregates.
 */
export interface GroupedOptions {
  /**
   * Column the rows are grouped on. It must be a `@Sortable()` column: the
   * list sorts on it so a group's rows follow each other.
   */
  groupByField: string;
  /**
   * `value` (the default): one group per value; `day` or `week`: one group
   * per calendar day or week of a date column.
   */
  by?: TableViewGroupBy;
  /** A click on a group header folds its rows. */
  collapsible?: boolean;
  /** Group headers show how many rows the group holds. */
  count?: boolean;
}

export interface TableViewOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  caption?: string;
  /**
   * Row density the table opens with: "compact" gives 36px rows under a 32px
   * header. The user picks another from the "Density" entry of the ⋯ table
   * menu, kept with the rest of the table's state.
   */
  density?: "default" | "compact";
  /**
   * Caps the rows in a scroll area of their own (any CSS length, e.g.
   * "60vh"), under a column header that stays in view while they scroll.
   */
  maxHeight?: string;
  /**
   * Expandable rows: a caret column in front of the content opens a detail
   * band under each row, listing `fields` or rendering `component`.
   * @example { fields: ["address", "carrier"], defaultExpanded: "first" }
   * @example { component: CustomComponent("OrderLines"), single: true }
   */
  expandable?: TableViewExpandableOptions;
  /**
   * How much the table draws around its rows: `"full"` (the default) or the
   * `"compact"` list of a settings page. See {@link TableViewLayout}.
   */
  layout?: TableViewLayout;
  /** Placeholder of the search field. `$`-prefixed: an i18n key. */
  searchPlaceholder?: string;
  /** One-click dropdown filters drawn in the toolbar. */
  quickFilters?: TableViewQuickFilter[];
  /**
   * Rows per page while the user has picked none, from 1 to 50 (registration
   * throws otherwise). Defaults to 10. A size other than the standard 10, 25
   * and 50 joins them in this table's page size picker.
   */
  pageSize?: number;
  /**
   * How the rows beyond the first page are reached. Defaults to `pages`.
   * See {@link TableViewPaginationMode}.
   */
  pagination?: TableViewPaginationMode;
  /**
   * The footer band: the row count and a hint, figures computed over the
   * listed rows (`summary`) and a legend of a select column's items.
   */
  footer?: TableViewFooterOptions<T>;
  /**
   * What the empty body of the grid and the `cards` display says when the
   * table has no row yet, when its filters match nothing, or when the list
   * failed. See {@link TableViewEmptyStates}.
   */
  emptyStates?: TableViewEmptyStates;
  /**
   * The key of the row id, default is _id
   */
  rowIdKey?: string;
  /**
   * The key of the field naming a row: it follows the title of the drawer or
   * modal that edits or shows the row ("Edit task · Write the docs"), and
   * ends the breadcrumb of its edit and details pages.
   */
  labelKey?: string;
  rowActions?: TableViewRowActionOptions<T>;
  customButtons?: CustomButton[];
  /**
   * Where the add, edit and details forms open (a page by default) and their
   * titles, in any container.
   * @example { type: "drawer", pages: { new: { displayName: "$tasks.form.new_title" } } }
   */
  formContainer?: FormContainer;
  /**
   * Enable archive mode: replaces delete action with archive/restore
   */
  archiveMode?: boolean;
  /**
   * Default filters to apply when the table view is opened
   */
  defaultFilters?: Array<{ accessorKey: string; value?: string; mode: string }>;
  /**
   * Default sort configuration applied when no user preference exists
   */
  defaultSort?: { field: string; desc?: boolean };
  /**
   * Maps URL query parameters to hidden filters applied to the table data.
   * These filters are not visible in the UI and not persisted in preferences.
   */
  queryParamFilters?: QueryParamFilters;
  /**
   * Maps DMS route parameters (extracted from the page slug, e.g. `:id`) to
   * hidden filters applied to the table data. Filters are not visible in the
   * UI nor persisted in preferences. Useful for detail pages where the table
   * must be scoped by a path param such as the parent entity id.
   */
  routeParamFilters?: RouteParamFilters;
  /**
   * When true, reject entire request if any row fails rule validation.
   * When false (default), only process rows that pass rule validation.
   */
  strictRuleValidation?: boolean;
  /**
   * Tabs displayed above the table. Each tab filters the rows on one column,
   * or links to another page. The implicit "all" tab (no filter) is shown
   * automatically when at least one tab is configured here.
   *
   * Each tab shows a row counter, fetched in one request: filter tabs with
   * counters require the controller to mount
   * `countBatch: TableViewRoutes.CountBatch`. `TableView()` warns at
   * registration when a table declares tabs without it.
   */
  tabs?: TableViewTab[];
  /**
   * When false, disables realtime broadcast/presence for this resource.
   * Defaults to true (realtime is opt-out).
   */
  realtime?: boolean;
  /**
   * Enable the kanban display mode for this collection. When set, users can
   * switch between the table and a kanban board from the toolbar.
   */
  kanban?: KanbanOptions;
  /**
   * Lets the user order the rows by hand: the rows are listed sorted on
   * `field`, a drag handle moves a row within its page, and only the rows
   * whose position changed are saved (a partial edit of `field`). Moving is
   * off while a search, a filter or a tab narrows the rows. Needs the
   * `edit` action.
   */
  reorder?: TableViewReorderOptions;
  /**
   * Offers the `grouped` display: the grid's columns with a header row per
   * group of rows. A view may open in it (`display: "grouped"`).
   * @example { groupByField: "createdAt", by: "day", count: true }
   */
  grouped?: GroupedOptions;
  /**
   * Named states of the table — filters, search, sort, columns, display and
   * density — drawn as tabs, a strip of pills or a menu, opened from the URL
   * (`?view=<id>`) and, with `userViews`, saved by users for themselves.
   * Views and `tabs` coexist: a tab filters on one column, a view sets the
   * whole table.
   */
  views?: TableViewViewsOptions;
  /**
   * The card the `kanban` and `cards` displays draw for each row: the columns
   * it shows, or a component drawing it whole.
   * @example { fields: ["email", "due_date"] }
   * @example { component: CustomComponent("TaskCard") }
   */
  card?: TableViewCardOptions;
  /**
   * Additional displays this table view offers beyond the implicit built-in
   * `table` (and `kanban` when the `kanban` option is set). Each `component` is
   * a frontend component resolved by name on the client from the global
   * registry (declare its directory with `global: true`); it receives the
   * normalized `context` prop. `selfManagedData`/`capabilities` are the SSR
   * source of truth for data fetching + chrome; the matching client plugin
   * (`registerTableViewDisplay`) supplies the id, label, icon and component.
   */
  displays?: TableViewDisplayOption[];
  /**
   * Display shown by default when the user has no saved preference. Defaults to
   * "table".
   */
  defaultDisplay?: string;
  /**
   * Server-side guards that run before mutating actions (edit/delete/archive/
   * restore/new). Throw with `assert(...)` from `@antelopejs/interface-api-util`
   * to abort the operation with an HTTP error and an i18n message key.
   * `this` inside a guard is the data controller instance, so models declared
   * with @Model are accessible.
   */
  guards?: TableViewGuards<T>;
  /**
   * Component slots the generated forms open, by form kind, so another module
   * can extend them through `RegisterComponentSlot` — the pending-invite edit
   * form opens one for the invite extensions. Values the slot adds to a form
   * reach the data routes only if the controller reads them.
   */
  formSlots?: Partial<Record<"new" | "edit" | "view", string>>;
  /**
   * Skip the tenant access gate on every data route of this table view, the
   * table-view mirror of the guards' `bypassTenantAccessGate` option. Reserved
   * for tables that must stay readable when a gate denies the tenant (e.g.
   * invoices on the billing page of a suspended tenant) so it can regularize
   * its situation. Data routes are registered independently of pages, so the
   * opt-out is controller-level and latched: once any `TableView()` call on a
   * controller declares it, the controller's routes bypass the gate wherever
   * they are rendered. Permission checks still apply.
   */
  bypassTenantAccessGate?: boolean;
}
