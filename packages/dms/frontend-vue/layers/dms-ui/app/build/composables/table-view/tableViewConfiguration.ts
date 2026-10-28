import { defineAsyncComponent } from "vue";
import { useTableViewConfig } from "./useTableViewConfig";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewConfiguration<T extends Data>(
  scope: Pick<TableViewScope<T>, "props">,
) {
  const REALTIME_ROW_TOPIC_PREFIX = "tableview:row:";
  const REALTIME_PRESENCE_TOPIC_PREFIX = "tableview:presence:";
  const ROW_ID_DEFAULT_KEY = "_id";
  const KanbanDisplay = defineAsyncComponent(
    () => import("../../../components/table-view/KanbanDisplay.vue"),
  );
  const REALTIME_EVENT_TYPE = {
    CREATED: "created",
    UPDATED: "updated",
    DELETED: "deleted",
    ACQUIRED: "acquired",
    RELEASED: "released",
    SNAPSHOT: "snapshot",
  } as const;
  const { props } = scope;
  const {
    allColumns,
    listableColumns,
    initialVisibility,
    tableProps,
    location,
    caption,
    labelKey,
    enableTableExport,
    archiveMode,
    defaultFilters,
    customButtons,
    formComponents,
    formContainer,
    formPages,
    componentId,
    pageId,
    defaultSort,
    queryParamFilters,
    routeParamFilters,
    routeParams,
    tabs,
    resolvedDisplays,
    defaultDisplay,
  } = useTableViewConfig<T>(props);
  return {
    componentId,
    pageId,
    queryParamFilters,
    allColumns,
    resolvedDisplays,
    defaultDisplay,
    KanbanDisplay,
    caption,
    routeParamFilters,
    routeParams,
    defaultSort,
    defaultFilters,
    initialVisibility,
    listableColumns,
    tabs,
    location,
    archiveMode,
    ROW_ID_DEFAULT_KEY,
    tableProps,
    labelKey,
    formComponents,
    formContainer,
    formPages,
    enableTableExport,
    REALTIME_ROW_TOPIC_PREFIX,
    REALTIME_PRESENCE_TOPIC_PREFIX,
    REALTIME_EVENT_TYPE,
    customButtons,
  };
}
