import type {
  TableRowActionsConfig,
  TableRowActionServices,
  BulkActionConfig,
  ConfirmedRun,
} from "./tableRowActionTypes";
import { TableViewEvents } from "../../../composables/table-view/types";
import {
  bulkActionQuery,
  bulkActionOutcome,
  bulkActionShortfall,
  type BulkActionOutcome,
} from "./utils/bulkActions";
import {
  ConfirmActionError,
  type ConfirmValues,
  type ConfirmPartialOutcome,
} from "../../../composables/confirm/types";
import { getErrorPayload } from "./tableRowActionValues";
export type TableRowActionErrorHandler = (
  error: unknown,
  title?: string,
) => void;
const createBulkRequest = (config: TableRowActionsConfig) => {
  const bulkAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_DELETE,
      success: TableViewEvents.ROW_DELETE_SUCCESS,
      error: TableViewEvents.ROW_DELETE_ERROR,
    },
  });

  /**
   * Sends a bulk request; resolves how many of the rows it reached. A failed
   * request rejects, for the caller to show where the user is looking.
   */
  const requestBulkAction = async (
    ids: string[],
    bulkConfig: BulkActionConfig,
    values: ConfirmValues = {},
  ): Promise<BulkActionOutcome> => {
    const hasValues = Object.keys(values).length > 0;
    const response = await bulkAction.execute(
      () => {
        const request: NonNullable<Parameters<typeof config.api>[1]> = {
          method: bulkConfig.method,
          query: bulkActionQuery(bulkConfig.queryKey, ids),
        };
        if (hasValues) request.body = values;
        return config.api(`${config.location}/${bulkConfig.kind}`, request);
      },
      {
        startPayload: { ids },
        successPayload: () => ({ ids }),
        errorPayload: (error) => ({ ids, error: getErrorPayload(error) }),
      },
    );
    return bulkActionOutcome(response, ids.length);
  };

  return requestBulkAction;
};
const createBulkReporter = (
  config: TableRowActionsConfig,
  services: TableRowActionServices,
) => {
  const { toast, t, processI18n } = services;
  /** Toasts what a bulk action changed, and refreshes the table. */
  const reportBulkSuccess = (
    processed: number,
    actionConfig: boolean | RowActionConfig | undefined,
    bulkConfig: BulkActionConfig,
    description?: string,
  ) => {
    const { successMessage } = normalizeActionConfig(actionConfig);
    toast.add({
      color: description ? Color.warning : Color.success,
      title: successMessage
        ? processI18n(successMessage, { count: processed })
        : t(bulkConfig.successKey, { count: processed }, processed),
      description,
    });
    config.refreshCallback?.();
  };

  return reportBulkSuccess;
};
export const createTableRowBulkOutcomes = (
  config: TableRowActionsConfig,
  services: TableRowActionServices,
  handleApiError: TableRowActionErrorHandler,
) => {
  const { t } = services;
  const { presentError } = useApiErrorPresenter();
  const requestBulkAction = createBulkRequest(config);
  const reportBulkSuccess = createBulkReporter(config, services);
  /**
   * The `onConfirm` of a bulk action's dialog: the request runs inside it,
   * so a refusal stays on screen, the dialog open for a retry or a cancel.
   * Rows a row rule refuses are left out by the server: when none went the
   * dialog says so (an error), when only some did the rest is done, the
   * table refreshed, and the dialog sums up what was refused.
   */
  const bulkActionRun =
    (
      ids: string[],
      actionConfig: boolean | RowActionConfig | undefined,
      bulkConfig: BulkActionConfig,
    ): ConfirmedRun =>
    async (values: ConfirmValues): Promise<void | ConfirmPartialOutcome> => {
      const outcome = await requestBulkAction(ids, bulkConfig, values);
      const shortfall = bulkActionShortfall(bulkConfig.kind, outcome, t);
      if (outcome.processed === 0 && shortfall) {
        throw new ConfirmActionError({
          fallbackKey: `dms.table.bulk_refused.${bulkConfig.kind}`,
          params: { count: outcome.skipped },
        });
      }
      reportBulkSuccess(outcome.processed, actionConfig, bulkConfig);
      if (shortfall) return { partial: shortfall };
    };

  /**
   * A bulk action without a dialog (a restore): its outcome is toasted, an
   * error when the request failed or no row went through.
   */
  const performDirectBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    bulkConfig: BulkActionConfig,
  ): Promise<boolean> => {
    let outcome: BulkActionOutcome;
    try {
      outcome = await requestBulkAction(ids, bulkConfig);
    } catch (error) {
      handleApiError(error, bulkConfig.errorKey);
      return false;
    }
    const shortfall = bulkActionShortfall(bulkConfig.kind, outcome, t);
    if (outcome.processed === 0) {
      presentError(null, {
        fallbackKey: `dms.table.bulk_refused.${bulkConfig.kind}`,
        params: { count: outcome.skipped },
      });
      return false;
    }
    reportBulkSuccess(
      outcome.processed,
      actionConfig,
      bulkConfig,
      shortfall && `${shortfall.title} ${shortfall.description ?? ""}`.trim(),
    );
    return true;
  };

  return { bulkActionRun, performDirectBulkAction };
};
