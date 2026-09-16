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
 * - `realtime` — mutation/presence broadcasting hooks around routes
 * - `routes` — the assembled `TableViewRoutes` a data controller mounts
 * - `factory` — the `TableView()` builder that ties it all together
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
export { TableView } from "./table-view/factory";
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
  TableViewMeta,
} from "./table-view/meta";
export {
  DEFAULT_ROW_ID_FIELD,
  type FormContainer,
  type FormContainerPageConfig,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  type KanbanOptionsSerialized,
  type QueryParamFilter,
  type QueryParamFilters,
  type RouteParamFilter,
  type RouteParamFilters,
  TABLE_DISPLAY_ID,
  type TableViewDisplayCapabilities,
  type TableViewDisplayOption,
  type TableViewDisplayOptionSerialized,
  type TableViewOptions,
  type TableViewOptionsSerialized,
  type TableViewRowActionOptions,
  type TableViewRowActionOptionsSerialized,
  type TableViewTab,
  type TableViewTabFilter,
} from "./table-view/options";
export {
  type RealtimeMutationContext,
  type RealtimeMutationEventType,
  type RealtimePageTopicContext,
  type RealtimePresenceActor,
  type RealtimePresenceContext,
  registerRealtimeMutationListener,
  setRealtimeMutationHook,
  setRealtimePageTopicHook,
  setRealtimePresenceHook,
  unregisterRealtimeMutationListener,
} from "./table-view/realtime";
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
export type { RowActionRule } from "./types/row-action";
