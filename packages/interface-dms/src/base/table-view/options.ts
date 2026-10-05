import type { ControllerClass } from "@antelopejs/interface-api";
import type { Component, ComponentInfoSerialized } from "../../component";
import type { FormPropsSerialized } from "../form-types";
import type { ColorValue } from "../types";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { TableViewGuards } from "../types/guards";
import type {
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfig,
} from "../types/row-action";
import type { ModalSize } from "../types/size";

/** The frontend component `TableView` emits. */
export const TABLE_VIEW_COMPONENT_NAME = "dms-table-view";

export const DEFAULT_ROW_ID_FIELD = "_id";

export interface TableViewRowActionOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Delete action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'status', notEquals: 'completed' } }
   */
  delete?: boolean | RowActionConfig<T>;
  /**
   * Archive action configuration
   */
  archive?: boolean | RowActionConfig<T>;
  /**
   * Restore action configuration
   */
  restore?: boolean | RowActionConfig<T>;
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
   * Add/new row action configuration
   */
  add?: boolean | RowActionConfig<T>;
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
  delete?: boolean | RowActionConfig;
  archive?: boolean | RowActionConfig;
  restore?: boolean | RowActionConfig;
  showArchived?: boolean;
  duplicate?: boolean | RowActionConfig;
  details?: boolean | RowActionConfig;
  edit?: boolean | RowActionConfig;
  copyLink?: boolean | RowActionConfig;
  add?: boolean | RowActionConfig;
  hasSelection?: boolean;
  custom?: CustomRowActionSerialized[];
}

export interface TableViewTabFilter {
  accessorKey: string;
  value?: string;
  mode: string;
}

export interface TableViewTab {
  id: string;
  label: string;
  /**
   * Hidden filters the tab applies. A link tab (`to`) applies none. A tab
   * with the id `"all"` stands in for the implicit "all" tab, at its own
   * position, with its own label and icon.
   */
  filters?: TableViewTabFilter[];
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
   * Permission id a caller must hold to be served a link tab given as a
   * path. A page controller target uses that page's own permission.
   */
  permission?: string;
  /**
   * Data controller (or data API location, e.g. `"/api/tables/invites"`)
   * whose row total a link tab shows as its counter.
   */
  countFrom?: ControllerClass | string;
  /**
   * Publishes the tab's counter as the navigation badge of the page it
   * stands for: the linked page, or this table's page for a filter tab.
   */
  badge?: boolean;
}

/** A tab as it reaches the client: link targets resolved to paths. */
export interface TableViewTabSerialized extends Omit<
  TableViewTab,
  "to" | "countFrom" | "permission" | "filters"
> {
  filters: TableViewTabFilter[];
  /** Path the link tab opens. */
  to?: string;
  /** Full id of the page a link tab opens, when it is a registered page. */
  toPage?: string;
  /** Data API location whose total the link tab shows. */
  countFrom?: string;
}

/** Ready-made chrome sets; see {@link TableViewChromeOptions}. */
export type TableViewChromePreset = "full" | "minimal";

/**
 * Which controls the table draws around its rows. Every toggle defaults to
 * the preset's value: `"full"` (the default) turns them all on with a
 * toggle search; `"minimal"` keeps an open search field, the tabs, quick
 * filters, custom buttons, sortable headers and a footer without the page
 * size picker — the reduced list of a settings page.
 */
export interface TableViewChromeOptions {
  preset?: TableViewChromePreset;
  /**
   * Caption heading and row count. Without it, the tabs move up into the
   * header band, left of the controls.
   */
  caption?: boolean;
  /**
   * Search: `true` a button that opens a field, `"field"` an always-open
   * field, `false` none. Needs `@Searchable` fields.
   */
  search?: boolean | "field";
  /** Filter button and filters row. */
  filters?: boolean;
  /** Sort popover button. Sortable column headers stay clickable. */
  sorting?: boolean;
  /** Refresh button. */
  refresh?: boolean;
  /** The ⋯ table menu: columns, density, export, import, page size. */
  menu?: boolean;
  /** Column header menus (sort, hide, pin) and column resizing. */
  columnMenus?: boolean;
  /** Rows-per-page picker in the footer. */
  pageSize?: boolean;
}

/**
 * A one-click filter drawn in the toolbar as a dropdown button listing the
 * values of a column: a select's items, a boolean's two labels, or the rows
 * a relation points to. Not persisted, not shown in the filters row.
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
  mode?: string;
}

/** Texts of the footer band. */
export interface TableViewFooterOptions {
  /**
   * Row count text, an i18n key with `$` receiving `{ count }` and pluralized
   * on it ("7 members"). Defaults to "{count} items".
   */
  countLabel?: string;
  /** A hint at the right of the count. `$`-prefixed: an i18n key. */
  hint?: string;
}

export interface KanbanOptionsSerialized extends Omit<
  KanbanOptions,
  "cardComponent"
> {
  cardComponent?: ComponentInfoSerialized;
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

/**
 * Expandable rows: a caret column opens a detail band under the row. The band
 * shows `fields` as a label/value list, `component` as a registered frontend
 * component, or both side by side.
 */
export interface TableViewExpandableOptions {
  /**
   * Columns listed in the band, each value rendered with its column's data
   * type. A column must be listable to carry a value; hide it from the grid
   * with `isVisible: false` (or `hiddenColumns`) to show it only here.
   */
  fields?: Array<string | TableViewExpandableField>;
  /** Eyebrow above the field list. `$`-prefixed: an i18n key. */
  fieldsLabel?: string;
  /**
   * Frontend component rendered in the band, resolved by name from the global
   * registry. It receives `row` (the listed row), `columns` (the table's column
   * metadata) and `rowId`.
   */
  component?: Component;
  /**
   * Rows open when the table loads and whenever a new page, filter, search,
   * sort, tab or archive view is listed. Defaults to "none".
   */
  defaultExpanded?: TableViewExpandedDefault;
  /** Keep at most one row open: opening a row closes the previous one. */
  single?: boolean;
}

export interface TableViewExpandableSerialized {
  fields?: TableViewExpandableField[];
  fieldsLabel?: string;
  component?: ComponentInfoSerialized;
  defaultExpanded?: TableViewExpandedDefault;
  single?: boolean;
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
> {
  enableTableExport: boolean;
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
}

/** Heading texts of one of the forms a table view opens. */
export interface TableViewFormText {
  /** Title of the page, drawer or modal. `$`-prefixed: an i18n key. */
  title?: string;
  /** Line under the title. `$`-prefixed: an i18n key. */
  description?: string;
}

/** The forms a table view opens: add (`new`), edit and details (`view`). */
export type TableViewFormKind = "new" | "edit" | "view";

export interface FormContainerPageConfig {
  urlSlug?: string;
  displayName?: string;
  description?: string;
  /**
   * When true, the DMS will not auto-create a form page for this action.
   * Use this when you have a manually registered page (via CustomComponent) at the same URL.
   * The urlSlug will still be used for navigation.
   */
  customPage?: boolean;
}

export interface FormContainerPages {
  new?: FormContainerPageConfig;
  edit?: FormContainerPageConfig;
  view?: FormContainerPageConfig;
}

export type FormContainer =
  | { type: "drawer" }
  | { type: "modal"; size?: ModalSize }
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

export const TABLE_DISPLAY_ID = "table";
export const KANBAN_DISPLAY_ID = "kanban";

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
   * Fields displayed on the default card below the title (labelKey). Each
   * value is rendered according to its column DataType, like a table cell.
   */
  cardFields?: string[];
  /**
   * Custom card component resolved by name on the frontend from the global
   * frontend registry; its directory must be declared globally. It
   * receives `item`, `columns` and `groupValue` props and can emit
   * `edit`/`delete`.
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

export interface TableViewOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  caption?: string;
  /** Row density: "compact" gives 36px rows under a 32px header. */
  density?: "default" | "compact";
  /**
   * Caps the rows in a scroll area of their own (any CSS length, e.g.
   * "60vh"), under a column header that stays in view while they scroll.
   */
  maxHeight?: string;
  /**
   * Expandable rows: a caret column in front of the content opens a detail
   * band under each row, listing `fields` and/or rendering `component`.
   * @example { fields: ["address", "carrier"], defaultExpanded: "first" }
   */
  expandable?: TableViewExpandableOptions;
  /**
   * Controls drawn around the rows: a preset (`"full"`, the default, or
   * `"minimal"`) or per-control toggles over a preset.
   * @example "minimal"
   * @example { preset: "minimal", caption: true }
   */
  chrome?: TableViewChromePreset | TableViewChromeOptions;
  /** Placeholder of the search field. `$`-prefixed: an i18n key. */
  searchPlaceholder?: string;
  /** One-click dropdown filters drawn in the toolbar. */
  quickFilters?: TableViewQuickFilter[];
  /**
   * Columns hidden from the grid by default, though still listed: a value a
   * cell, a detail band or a form reads, without a column of its own. The
   * column manager can show them again.
   */
  hiddenColumns?: string[];
  /** Rows per page while the user has picked none. Defaults to 10. */
  pageSize?: number;
  /** Texts of the footer band: the row count and a hint. */
  footer?: TableViewFooterOptions;
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
  /**
   * Titles and descriptions of the add, edit and details forms, whatever
   * container opens them: "New task", "Edit task", "Task details". A
   * page-mode `formContainer.pages` entry's `displayName` and `description`
   * win over them for its page. Left out, the forms read "New entry",
   * "Edit entry" and "Entry details", the drawer and modal naming the
   * caption in their description.
   * @example { new: { title: "$tasks.form.new_title", description: "$tasks.form.new_description" } }
   */
  formTexts?: Partial<Record<TableViewFormKind, TableViewFormText>>;
  rowActions?: TableViewRowActionOptions<T>;
  customButtons?: CustomButton[];
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
   * Tabs displayed above the table. Each tab applies a set of hidden filters.
   * The implicit "all" tab (no filters) is shown automatically when at least
   * one tab is configured here.
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
