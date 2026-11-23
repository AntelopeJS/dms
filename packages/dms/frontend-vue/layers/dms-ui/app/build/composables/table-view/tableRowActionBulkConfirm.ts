import type {
  TableRowActionsConfig,
  TableRowActionServices,
  BulkActionConfig,
  ConfirmedRun,
  DeleteRowsOptions,
} from "./tableRowActionTypes";
import { namesRowField } from "#dms-core/app/utils/url-interpolation";
import {
  isConfirmFrom,
  type ActionConfirm,
} from "#dms-core/app/types/confirm-dialog";
import { bulkSelectionQuery, withQuery } from "../actions/bulkSelection";
import {
  bulkActionConfirm,
  type ConfirmedBulkAction,
} from "./utils/bulkActions";
import type { ConfirmOptions } from "../../../composables/confirm/types";
import { getItemId, DEFAULT_ROW_ID_KEY } from "./tableRowActionValues";
import {
  createTableRowBulkOutcomes,
  type TableRowActionErrorHandler,
} from "./tableRowActionBulkRequests";
const declaredBulkConfirm = (
  actionConfig: boolean | RowActionConfig | undefined,
  ids: string[],
): ActionConfirm | undefined => {
  const declared = normalizeActionConfig(actionConfig).confirm;
  if (!declared || !isConfirmFrom(declared)) return declared;
  if (namesRowField(declared.from)) {
    return ids.length === 1 ? declared : undefined;
  }
  return {
    from: withQuery(
      declared.from,
      bulkSelectionQuery({ ids, count: ids.length }),
    ),
  };
};
/**
 * What a fixed dialog words: the rows' count, and for one row its own fields
 * too (`{name}`). `count` wins a clash with a row field, as every bulk dialog
 * may name it.
 */
const createConfirmRowFields = (config: TableRowActionsConfig) => {
  const rowIdOf = (row: Data): string =>
    String(getItemId(row, config.rowIdKey ?? DEFAULT_ROW_ID_KEY));

  const findRowIn = (rows: Data[] | undefined, id: string) =>
    rows?.find((row) => rowIdOf(row) === id);

  const readRow = async (
    id: string,
    declared: ActionConfirm,
  ): Promise<Data | undefined> => {
    const getRow = config.rowNavigation?.getRow;
    if (!getRow || isConfirmFrom(declared)) return undefined;
    return getRow(id).catch(() => undefined);
  };

  const findConfirmRow = async (
    id: string,
    declared: ActionConfirm,
    rows?: Data[],
  ): Promise<Data | undefined> =>
    findRowIn(rows, id) ??
    findRowIn(config.rowNavigation?.rows(), id) ??
    (await readRow(id, declared));

  const confirmRowFields = async (
    ids: string[],
    declared: ActionConfirm,
    rows?: Data[],
  ): Promise<Data> => {
    const count = { count: ids.length };
    const [id, ...others] = ids;
    const row =
      id !== undefined && others.length === 0
        ? await findConfirmRow(id, declared, rows)
        : undefined;
    return row ? { ...row, ...count } : count;
  };

  return confirmRowFields;
};
const createBulkConfirmations = (
  config: TableRowActionsConfig,
  services: TableRowActionServices,
  bulkActionRun: ReturnType<typeof createTableRowBulkOutcomes>["bulkActionRun"],
) => {
  const { confirmAction, confirm, t } = services;
  const confirmRowFields = createConfirmRowFields(config);
  const askDeclaredBulkConfirm = async (
    declared: ActionConfirm,
    ids: string[],
    fallback: Partial<ConfirmOptions>,
    run: ConfirmedRun,
    rows?: Data[],
  ): Promise<boolean> =>
    confirmAction(declared, {
      urlParams: {
        id: ids[0],
        [config.rowIdKey ?? DEFAULT_ROW_ID_KEY]: ids[0],
      },
      row: await confirmRowFields(ids, declared, rows),
      fallback,
      run,
    });

  const confirmBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    action: ConfirmedBulkAction,
    bulkConfig: BulkActionConfig,
    rows?: Data[],
  ): Promise<boolean> => {
    const fallback = bulkActionConfirm(action, ids.length, t);
    const run = bulkActionRun(ids, actionConfig, bulkConfig);
    const declared = declaredBulkConfirm(actionConfig, ids);
    if (declared) {
      return askDeclaredBulkConfirm(declared, ids, fallback, run, rows);
    }
    return confirm({ ...fallback, onConfirm: run });
  };

  return { askDeclaredBulkConfirm, confirmBulkAction };
};
/**
 * The bulk actions of a table's rows, each asking its confirmation before it
 * runs.
 *
 * `deleteRows`, `archiveRows` and `restoreRows` resolve whether the rows went:
 * `false` when the user cancelled, gave up after a failure, or the request
 * failed, so the caller keeps its selection.
 */
export const createTableRowBulkActions = (
  config: TableRowActionsConfig,
  services: TableRowActionServices,
  handleApiError: TableRowActionErrorHandler,
) => {
  const { t } = services;
  const { bulkActionRun, performDirectBulkAction } = createTableRowBulkOutcomes(
    config,
    services,
    handleApiError,
  );
  const { askDeclaredBulkConfirm, confirmBulkAction } = createBulkConfirmations(
    config,
    services,
    bulkActionRun,
  );
  const DELETE_CONFIG: BulkActionConfig = {
    kind: "delete",
    method: HttpMethod.delete,
    queryKey: "id",
    successKey: "dms.table.delete_rows",
    errorKey: "dms.table.delete_error",
  };

  const ARCHIVE_CONFIG: BulkActionConfig = {
    kind: "archive",
    method: HttpMethod.put,
    queryKey: "ids",
    successKey: "dms.table.archive_rows",
    errorKey: "dms.table.archive_error",
  };

  const RESTORE_CONFIG: BulkActionConfig = {
    kind: "restore",
    method: HttpMethod.put,
    queryKey: "ids",
    successKey: "dms.table.restore_rows",
    errorKey: "dms.table.restore_error",
  };

  const deleteRows = async (
    ids: string[],
    deleteConfig: boolean | RowActionConfig | undefined,
    options: DeleteRowsOptions = {},
  ): Promise<boolean> => {
    if (!normalizeActionConfig(deleteConfig).isEnabled) return false;
    const action = options.permanently ? "deletePermanently" : "delete";
    return confirmBulkAction(
      ids,
      deleteConfig,
      action,
      DELETE_CONFIG,
      options.rows,
    );
  };

  const archiveRows = async (
    ids: string[],
    archiveConfig: boolean | RowActionConfig | undefined,
  ): Promise<boolean> => {
    if (!normalizeActionConfig(archiveConfig).isEnabled) return false;
    return confirmBulkAction(ids, archiveConfig, "archive", ARCHIVE_CONFIG);
  };

  const restoreRows = async (
    ids: string[],
    restoreConfig: boolean | RowActionConfig | undefined,
  ): Promise<boolean> => {
    if (!normalizeActionConfig(restoreConfig).isEnabled) return false;
    const declared = declaredBulkConfirm(restoreConfig, ids);
    if (declared) {
      return askDeclaredBulkConfirm(
        declared,
        ids,
        {
          confirmLabel: t("dms.button.restore"),
          color: "primary",
          icon: "i-ph-arrow-counter-clockwise",
        },
        bulkActionRun(ids, restoreConfig, RESTORE_CONFIG),
      );
    }
    return performDirectBulkAction(ids, restoreConfig, RESTORE_CONFIG);
  };

  return { deleteRows, archiveRows, restoreRows };
};
