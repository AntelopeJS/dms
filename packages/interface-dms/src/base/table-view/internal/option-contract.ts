/** @internal @packageDocumentation */
import type {
  CustomButtonSerialized,
  CustomButton,
} from "../../types/custom-button";
import type {
  TableViewRowActionOptionsSerialized,
  TableViewRowActionOptions,
} from "./option-row-actions";
import type { ComponentInfoSerialized } from "../../../component";
import type { FormPropsSerialized } from "../../form-types";
import type {
  QueryParamFilters,
  RouteParamFilters,
  TableViewLayout,
  TableViewQuickFilter,
  TableViewPaginationMode,
  TableViewReorderOptions,
} from "./option-filtering";
import type {
  TableViewTabSerialized,
  TableViewViewsSerialized,
  TableViewRowClick,
  TableViewColumnsOptions,
  TableViewTab,
  TableViewViewsOptions,
} from "./option-views";
import type {
  TableViewDisplayOptionSerialized,
  KanbanOptions,
  GroupedOptions,
  TableViewCardOptions,
  TableViewDisplayOption,
} from "./option-displays";
import type {
  TableViewFormPageUrls,
  FormContainer,
  TableViewFormSetup,
} from "./option-forms";
import type {
  TableViewExpandableSerialized,
  TableViewExpandableOptions,
} from "./option-expandable";
import type {
  TableViewFooterSerialized,
  TableViewFooterOptions,
} from "./option-footer";
import type {
  TableViewEmptyStatesSerialized,
  TableViewEmptyStates,
} from "./option-empty-states";
import type { TableViewSourceSerialized } from "../source";
import type { RowActionRule } from "../../types/row-action";
import type { TableViewGuards } from "../../types/guards";

export interface TableViewOptionsSerialized extends Omit<
  TableViewOptions,
  | "columns"
  | "customButtons"
  | "rowActions"
  | "kanban"
  | "displays"
  | "formSlots"
  | "forms"
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
 * When a `liveHold` table also holds its rows while its live page is in
 * Direct: the table alone keeps them and counts its events into the
 * "N new · Show" banner, the other blocks of the page staying live. The
 * banner says why the table holds ("Table on hold · search active"). It reads
 * the rows once again when the hold ends, if it missed any.
 */
export interface TableViewLiveHoldOptions {
  /** While one of its rows is open in the side panel. Defaults to false. */
  whileRowOpen?: boolean;
  /** While the user has scrolled its first row out of view. Defaults to false. */
  whileScrolled?: boolean;
  /** While the user's search narrows the rows. Defaults to false. */
  whileSearching?: boolean;
  /**
   * While the user sorts the rows otherwise than by the table's `defaultSort`
   * (the newest first, for a log): new rows would land anywhere among them.
   * Defaults to false.
   */
  whileSorted?: boolean;
  /**
   * What the strip calls the new rows, given `{count}`, as the `LiveToggle`'s
   * own `missedLabel`: an i18n key prefixed with `$`
   * (`"$api.live.new_requests"`, "12 new requests"), or a text. While the
   * page is paused, the strip adds the breakdown a component gave with
   * `usePageLive().setMissedDetail` ("12 new requests · 2 in 5xx").
   * Defaults to "N new".
   */
  missedLabel?: string;
}

export interface TableViewOptions<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published default accepts module-owned rows.
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
   * What runs the row's click action: a double-click by default, a single
   * click with `"single"`. See {@link TableViewRowClick}.
   * @example "single"
   */
  rowClick?: TableViewRowClick;
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
  /**
   * The key that opens and focuses the search field, in Nuxt UI
   * `defineShortcuts` notation: `"/"`, `"shift_f"`, `"meta_k"`. Defaults to
   * `"shift_f"` (⇧F). Like every table shortcut, it does not fire while the
   * user types in a field, so `"/"` stays a character there.
   * @example "/"
   */
  searchShortcut?: string;
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
  /**
   * The controller's columns as this table view shows them, when one page
   * needs them otherwise than the controller declares: a related list on a
   * record's page hides the column naming that record.
   * @example { hidden: ["workspace"] }
   */
  columns?: TableViewColumnsOptions;
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
   * The count the caption shows while the archived rows are listed, naming
   * them: an i18n key with `$` receiving `{ count }` and pluralized on it
   * ("13 factures archivées"), or a text with `{count}`. Defaults to
   * "Archived: {count}" ("Archives : {count}" in French), which agrees with
   * no noun.
   * @example "$invoices.archived_count"
   */
  archivedCountLabel?: string;
  /**
   * Default filters to apply when the table view is opened
   */
  defaultFilters?: Array<{ accessorKey: string; value?: string; mode: string }>;
  /**
   * Default sort configuration applied when no user preference exists, and
   * the sort the table goes back to when the user clears theirs.
   */
  defaultSort?: { field: string; desc?: boolean };
  /**
   * Rows listed first, whatever the sort: those `pinnedRows` accepts, a rule
   * on the row's fields as a row action's `rule`, in the order the sort gives
   * them. The rest follows in the sort's order. A route answering every row
   * (a `TableView.fromSource` without `paginate`) has its pinned rows on the
   * first page; a route answering one page has them first within the page it
   * answers. The `grouped` display keeps its groups and pins nothing;
   * registration refuses it alongside `reorder`, whose rows keep their
   * position.
   * @example { field: "isBase", equals: true }
   */
  pinnedRows?: RowActionRule<T>;
  /**
   * Maps URL query parameters to hidden filters applied to the table data.
   * These filters are not persisted in preferences, and not visible in the UI
   * unless one sets `visible: true`: it then shows as a removable chip.
   * @example { email: { field: "email", visible: true, label: "$app.email" } }
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
   * Topics the backend publishes on (`PublishMessage`) when the rows change
   * without a write through this table's routes — a batch, a job, an import.
   * The table reads its rows again on each event, keeping the current rows on
   * screen until the answer lands. The page registers them, as for a chart's
   * `realtimeTopic`. Independent of `realtime`, which covers the writes made
   * through the controller.
   */
  realtimeTopic?: string | string[];
  /**
   * On a page declared with `live`, keeps the rows on screen while the page is
   * paused, through the user's own search, sort and pagination too, and shows
   * a "N new · Show" banner counting the rows the table would add since:
   * how many more rows its tab, search and filters match now than it holds,
   * asked of its count route (the events received, if that count fails).
   * Show reads the rows once without leaving the pause. The page in Direct,
   * the table also keeps its rows while they are on screen or scrolled past:
   * a new row at the top would push down the rows the user reads, so new ones
   * wait behind a "N new · Show" pill laid over the rows, which moves nothing.
   * A table still below the screen follows the feed.
   *
   * A `TableView.fromSource` route receives the moment the rows were frozen
   * as `liveHeldAt` (ISO 8601) on every list and count request made while
   * paused, so it can answer the rows as they stood then; a data controller's
   * rows are held against the realtime only. Ignored on a page without `live`.
   *
   * An object also names why the table holds, the rest of the page staying
   * live, in more cases (see {@link TableViewLiveHoldOptions}); `true` and
   * `{}` hold it while the page is paused or its rows are on screen.
   *
   * ```ts
   * liveHold: { whileRowOpen: true, whileScrolled: true, whileSearching: true }
   * ```
   */
  liveHold?: boolean | TableViewLiveHoldOptions;
  /**
   * Enable the kanban display mode for this collection. When set, users can
   * switch between the table and a kanban board from the toolbar.
   */
  kanban?: KanbanOptions;
  /**
   * Lets the user order the rows by hand: the rows are listed sorted on
   * `field`, a drag handle moves a row within its page — on the grid and on
   * the `cards` display, whose custom `card.component` receives the handle
   * as its `reorder` prop — and only the rows whose position changed are
   * saved (a partial edit of `field`). Moving is off while a search, a
   * filter or a tab narrows the rows. Needs the `edit` action.
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
   * The displays this table view offers, in the switcher's order. Left out,
   * the table view offers the built-in `table` alone; listed, it offers
   * exactly these, so the grid is kept by listing `{ id: "table" }`. The
   * `kanban` and `grouped` options add their display after the list unless it
   * places them. Each `component` is a frontend component resolved by name on
   * the client from the global registry (declare its directory with
   * `global: true`); it receives the normalized `context` prop.
   * `selfManagedData`/`capabilities` are the SSR source of truth for data
   * fetching + chrome; the matching client plugin (`registerTableViewDisplay`)
   * supplies the id, label, icon and component.
   * @example [{ id: "table" }, { id: "cards" }]
   */
  displays?: TableViewDisplayOption[];
  /**
   * Display shown by default when the user has no saved preference. Defaults to
   * the first display offered: `table` when `displays` is left out.
   */
  defaultDisplay?: string;
  /**
   * Display a phone opens on (a viewport narrower than 768px) when the user
   * has no saved choice and the open view sets no `display` of its own (a
   * `views.defaultView` without one opens on it too): `cards` gives a narrow screen a
   * card per row instead of a grid cut after its first columns. One of the
   * displays offered, so the switcher still leads back to the grid. Applied
   * once mounted (the server cannot see the viewport) and not saved: the same
   * user on a wide screen keeps `defaultDisplay`.
   * @example { displays: [{ id: "table" }, { id: "cards" }], mobileDisplay: "cards" }
   */
  mobileDisplay?: string;
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
   * Settles the forms the table view generates, by form kind, for input
   * comfort only: each callback receives the form's builder before the table
   * view embeds it, and declares on it what a module's own `Form` would — a
   * value filled in from another (`SET_FIELD_VALUE`), a field one table's
   * forms leave out. No data rule here: the data routes never see these
   * watches. A field shown, required or locked by the value of another is a
   * column's `visibleWhen` / `disabledWhen`, which the routes enforce too.
   * What it declares holds in a drawer, a modal or a form page alike; the
   * `new` form's also on a duplicated row. A watch's `requirePermission` is
   * checked per request, as on a page's own components.
   *
   * @example
   * forms: {
   *   new: (form) =>
   *     form.watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_VALUE, {
   *       params: { targetField: "probability", valueMap: { won: 100, lost: 0 } },
   *       onParam: { key: "fieldId", value: "stage" },
   *     }),
   * }
   */
  forms?: Partial<Record<"new" | "edit" | "view", TableViewFormSetup>>;
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
