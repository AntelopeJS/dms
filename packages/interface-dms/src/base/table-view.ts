/**
 * Public entry of the table-view component, split by concern under
 * `./table-view/`:
 *
 * - `options` — the consumer-facing option types and their serialized forms
 * - `meta` — `TableViewMeta` and the column declaration decorators
 * - `data-functions` — the interface functions the data implementation
 *   provides (search, export, archive, guard fetches)
 * - `row-rules` — server-side row action rule validation around a route
 * - `guards` — consumer guard invocation around mutating routes
 * - `files` — staged upload promotion and orphaned file cleanup
 * - `auth` — per-action permission checks and the tenant access gate
 * - `realtime` — mutation/presence broadcasting around routes, and the topics
 *   a table view registers for its page
 * - `routes` — the assembled `TableViewRoutes` a data controller mounts
 * - `factory` — the `TableView()` builder that ties it all together, with
 *   `factory-helpers` (serialization, actions, form pages), `validation`
 *   (declaration checks), `tabs` (filter tabs), `request-filter` (what one
 *   request is served) and `writer` (the one TableView writing through a
 *   controller)
 * - `resource-form` — the forms over a resource, shared by `TableView()` and
 *   the `ResourceForm()` block
 *
 * The barrel re-exports the exact surface the former single-file module
 * exposed; the pieces also export their cross-file internals, which are not
 * part of the public interface.
 */

export { authorizeAction, GATE_BYPASSABLE_ACTIONS } from "./table-view/auth";
export {
  archiveRows,
  countWithSearch,
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
  type TableViewFooterOptions,
  type TableViewLayout,
  type TableViewQuickFilter,
  type TableViewQuickFilterMode,
  type TableViewOptions,
  type TableViewOptionsSerialized,
  type TableViewRowActionOptions,
  type TableViewRowActionOptionsSerialized,
  type TableViewTab,
  type TableViewTabFilter,
  type TableViewTabSerialized,
} from "./table-view/options";
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
export {
  ResourceForm,
  resourceForm,
  ROUTE_PARAM_ROW_ID,
  stampAttachmentFields,
} from "./table-view/resource-form";
export { TableViewRoutes } from "./table-view/routes";
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
export {
  isConfirmFrom,
  serializeActionConfirm,
  serializeConfirmDialog,
} from "./confirm-dialog";
