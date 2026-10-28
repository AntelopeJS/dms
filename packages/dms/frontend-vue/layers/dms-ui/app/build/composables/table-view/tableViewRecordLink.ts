import { until } from "@vueuse/core";
import { isDeepLinkAction, resolveDeepLinkedRow } from "./utils/recordLink";
import { useTableRecordLink } from "./useTableRecordLink";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewRecordLink<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "arrival"
    | "listState"
    | "rowRealtime"
    | "rows"
    | "rowActions"
    | "sortRecovery"
    | "tabs"
  >,
) {
  const { tableProps } = scope.configuration;
  const { route, urlScope } = scope.arrival;
  const { isListLoading, shownResults } = scope.listState;
  const { getRowId } = scope.rowRealtime;
  const { tableRows } = scope.rows;
  const { handleCustomRowAction, handleMissingRow } = scope.rowActions;
  const { toast } = scope.sortRecovery;
  const { t } = scope.tabs;
  const deepLinkAction = (tableProps.value.rowActions?.custom ?? []).find(
    isDeepLinkAction,
  );
  const recordLink = deepLinkAction
    ? useTableRecordLink<T>({
        route,
        urlScope,
        action: deepLinkAction,
        resolve: async (id) => {
          await until(isListLoading).toBe(false);
          return resolveDeepLinkedRow(id, {
            listed: shownResults.value ?? undefined,
            idOf: getRowId,
            getRow: tableRows.getRow,
          });
        },
        open: (row) => handleCustomRowAction(deepLinkAction, row),
        showMissing: (id) => handleMissingRow(deepLinkAction, id),
        notify: (outcome) => toast.add(recordLinkToasts[outcome]()),
      })
    : undefined;

  const recordLinkToasts = {
    notify: () => ({
      title: t("dms.record_link.not_found_title"),
      description: t("dms.record_link.not_found_description"),
      color: Color.warning,
      icon: "i-ph-link-break",
    }),
    notifyFailed: () => ({
      title: t("dms.record_link.failed_title"),
      description: t("dms.record_link.failed_description"),
      color: Color.error,
      icon: "i-ph-warning-circle",
    }),
  };
  return { recordLink };
}
