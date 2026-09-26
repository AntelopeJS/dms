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
  filters: TableViewTabFilter[];
  icon?: string;
  textColor?: ColorValue;
  iconColor?: ColorValue;
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

export interface TableViewOptionsSerialized extends Omit<
  TableViewOptions,
  "customButtons" | "rowActions" | "kanban" | "displays" | "formSlots"
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
  tabs?: TableViewTab[];
  displays?: TableViewDisplayOptionSerialized[];
  /**
   * Resolved page-mode form URLs. Server-computed, so the frontend navigates to
   * the very URLs the form sub-pages were registered under instead of rebuilding
   * them from the browser path. Absent when the container is not a page.
   */
  formPages?: TableViewFormPageUrls;
}

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
  /**
   * The key of the row id, default is _id
   */
  rowIdKey?: string;
  /**
   * The key of the field to use as label for identifying items in container titles
   */
  labelKey?: string;
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
