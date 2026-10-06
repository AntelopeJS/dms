/**
 * Public entry of the table-view component, split by concern under
 * `./table-view/`:
 *
 * - `options` — the consumer-facing option types and their serialized forms
 * - `meta` — `TableViewMeta` and the column declaration decorators
 * - `data-functions` — the interface functions the data implementation
 *   provides (search, export, archive, guard fetches)
 * - `realtime` — the topics of a table view and the mutation listeners a
 *   module may add
 * - `routes` — the assembled `TableViewRoutes` a data controller mounts
 * - `factory` — the `TableView()` builder that ties it all together
 * - `resource-form` — the `ResourceForm()` block over a resource
 *
 * The plumbing behind them lives under `./table-view/internal/` and is not
 * re-exported here: row rule validation (`row-rules`), consumer guards
 * (`guards`), staged uploads (`files`), per-action permission checks
 * (`auth`), the realtime route wrappers (`realtime`), serialization and form
 * pages (`factory-helpers`), declaration checks (`validation`), filter tabs
 * (`tabs`), what one request is served (`request-filter`), the one TableView
 * writing through a controller (`writer`) and the forms over a resource
 * (`resource-form`).
 */

export {
  archiveRows,
  BULK_ALL_MATCHING_KEY,
  countWithSearch,
  MAX_BULK_MATCHING_ROWS,
  resolveBulkRowIds,
  summarizeWithSearch,
  downloadExport,
  fetchRowForGuard,
  getExportStatus,
  listWithSearch,
  restoreRows,
  startExport,
  validateRowsAgainstRule,
} from "./table-view/data-functions";
export * from "./table-view/column-display";
export { TableView } from "./table-view/factory";
export { WritingTableViewConflictError } from "./table-view/writer";
export {
  TableViewEvents,
  TableViewFunctions,
} from "./table-view/factory-helpers";
export {
  ArchiveField,
  Column,
  ColumnGroup,
  type ColumnGroupConfig,
  type ColumnOptions,
  Exported,
  Select,
  type TableViewAccess,
  TableViewMeta,
} from "./table-view/meta";
export {
  CARDS_DISPLAY_ID,
  DEFAULT_ROW_ID_FIELD,
  GROUPED_DISPLAY_ID,
  MAX_TABLE_PAGE_SIZE,
  type FormContainer,
  type FormContainerPageConfig,
  type FormContainerPages,
  type FormContainerPageTexts,
  type GroupedOptions,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  type KanbanOptionsSerialized,
  type QueryParamFilter,
  type QueryParamFilters,
  type RouteParamFilter,
  type RouteParamFilters,
  TABLE_DISPLAY_ID,
  type TableViewCardOptions,
  type TableViewCardOptionsSerialized,
  type TableViewDisplayCapabilities,
  type TableViewDisplayOption,
  type TableViewDisplayOptionSerialized,
  type TableViewExpandableBehavior,
  type TableViewExpandableComponent,
  type TableViewExpandableField,
  type TableViewExpandableFields,
  type TableViewExpandableOptions,
  type TableViewExpandableSerialized,
  type TableViewExpandedDefault,
  type TableViewEmptyState,
  type TableViewEmptyStates,
  type TableViewEmptyStateSerialized,
  type TableViewEmptyStatesSerialized,
  type TableViewFooterOptions,
  type TableViewFooterSerialized,
  type TableViewFooterSummary,
  type TableViewFooterSummarySerialized,
  type TableViewSummaryFormat,
  type TableViewSummaryOperation,
  type TableViewLayout,
  type TableViewQuickFilter,
  type TableViewQuickFilterMode,
  type TableViewOptions,
  type TableViewOptionsSerialized,
  type TableViewPaginationMode,
  type TableViewReorderOptions,
  type TableViewRowActionOptions,
  type TableViewRowActionOptionsSerialized,
  type TableViewTab,
  type TableViewTabFilter,
  type TableViewTabSerialized,
  type TableViewColumnsState,
  type TableViewDensity,
  type TableViewGroupBy,
  type TableViewSort,
  type TableViewView,
  type TableViewViewSerialized,
  type TableViewViewsLayout,
  type TableViewViewsOptions,
  type TableViewViewsSerialized,
  type TableViewViewState,
} from "./table-view/options";
export {
  TABLE_VIEW_TAB_QUERY_KEY,
  TABLE_VIEW_VIEW_QUERY_KEY,
  tableViewLink,
  type TableViewLinkTarget,
} from "./table-view/views";
export {
  internal,
  type RealtimeMutationContext,
  type RealtimeMutationEventType,
  type RealtimePresenceActor,
  type RealtimePresenceContext,
  registerRealtimeMutationListener,
  tableViewPresenceTopic,
  tableViewRowTopic,
  unregisterRealtimeMutationListener,
} from "./table-view/realtime";
export { ResourceForm, ROUTE_PARAM_ROW_ID } from "./table-view/resource-form";
export { TableViewRoutes } from "./table-view/routes";
export {
  tableViewFromSource,
  type TableViewSourceCapabilities,
  type TableViewSourceColumn,
  type TableViewSourceOptions,
  type TableViewSourceSerialized,
} from "./table-view/source";
export * from "./table-view/schema";
export type {
  BulkGuardArgs,
  DeleteGuardArgs,
  EditGuardArgs,
  GuardFn,
  NewGuardArgs,
  TableViewGuards,
} from "./types/guards";
export type {
  BulkRowActionConfig,
  CustomRowActionBulk,
  CustomRowActionBulkOptions,
  RowActionConfig,
  RowActionConfigSerialized,
  RowActionRule,
} from "./types/row-action";
export type {
  ActionConfirm,
  ActionConfirmSerialized,
  ConfirmDialog,
  ConfirmDialogFrom,
  ConfirmDialogImpact,
  ConfirmDialogSerialized,
} from "./types/confirm-dialog";
export { serializeConfirmDialog } from "./confirm-dialog";
