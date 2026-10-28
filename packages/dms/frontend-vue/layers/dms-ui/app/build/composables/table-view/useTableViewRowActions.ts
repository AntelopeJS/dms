import { useActionConfirm } from "../confirm/useActionConfirm";
import { useActionTargets } from "../actions/useActionTargets";
import { describeTableWriteError } from "./utils/writeError";
import type {
  TableRowActionsConfig,
  TableRowActionServices,
} from "./tableRowActionTypes";
import { getItemId, DEFAULT_ROW_ID_KEY } from "./tableRowActionValues";
import { createTableRowFormContainer } from "./tableRowActionContainers";
import { createTableRowNavigation } from "./tableRowActionNavigation";
import { createTableRowEvents } from "./tableRowActionEvents";
import { createTableRowBulkActions } from "./tableRowActionBulkConfirm";
export const useTableRowActions = <T extends Data>(
  config: TableRowActionsConfig,
) => {
  const toast = useToast();
  const { t, locale } = useI18n();
  const { confirm } = useConfirm();
  const { confirmAction } = useActionConfirm();
  const { processI18n } = useTranslation();
  const { open: openModal } = useModal();
  const { open: openDrawer } = useDrawer();
  const route = useDmsRoute();

  const services: TableRowActionServices = {
    toast,
    t,
    locale,
    confirm,
    confirmAction,
    processI18n,
    openModal,
    openDrawer,
    route,
  };
  /**
   * Toasts a failed action that has no dialog to show it in: `title` names
   * what failed, the description is the server's message when it is meant
   * for users, else a translated fallback (never a raw error line).
   */
  const handleApiError = (
    error: Parameters<typeof describeTableWriteError>[0],
    title?: string,
  ) => {
    toast.add({
      color: Color.error,
      icon: "i-ph-warning-circle",
      title: title || t("dms.form.error_title"),
      description: describeTableWriteError(
        error,
        t,
        config.columns,
        processI18n,
      ),
    });
  };

  const createFormContainer = createTableRowFormContainer<T>(config, services);
  const navigation = createTableRowNavigation<T>(
    config,
    route,
    createFormContainer,
  );
  const { openRow, openRowById, editRow, newRow, duplicateRow } =
    createTableRowEvents<T>(config, navigation);
  const { deleteRows, archiveRows, restoreRows } = createTableRowBulkActions(
    config,
    services,
    handleApiError,
  );
  /**
   * Runs a built-in action (edit, details, duplicate, add…) after the
   * confirmation it declares, if any.
   */
  const runConfirmedBuiltIn = async <Result>(
    actionConfig: boolean | RowActionConfig | undefined,
    rowData: Data | undefined,
    proceed: () => Result,
  ): Promise<void> => {
    const declared = normalizeActionConfig(actionConfig).confirm;
    if (declared) {
      const id = rowData
        ? getItemId(rowData, config.rowIdKey ?? DEFAULT_ROW_ID_KEY)
        : undefined;
      const isConfirmed = await confirmAction(declared, {
        row: rowData,
        urlParams: { id },
      });
      if (!isConfirmed) return;
    }
    await proceed();
  };

  const {
    handleCustomButton,
    handleCustomRowAction,
    handleBulkCustomAction,
    handleMissingRow,
  } = useActionTargets({
    api: config.api,
    pageId: config.pageId,
    componentId: config.componentId,
    refreshCallback: config.refreshCallback,
    handleApiError,
    rowNavigation: config.rowNavigation,
    recordScope: config.recordScope,
    onRecordShown: config.onRecordShown,
    rowIdKey: config.rowIdKey,
  });

  return {
    createFormContainer,
    openRow,
    openRowById,
    editRow,
    newRow,
    duplicateRow,
    deleteRows,
    archiveRows,
    restoreRows,
    handleCustomButton,
    handleCustomRowAction,
    handleBulkCustomAction,
    handleMissingRow,
    handleApiError,
    runConfirmedBuiltIn,
  };
};
