import {
  fillFormPageUrl,
  type FormContainer,
  type FormPageUrls,
} from "./useTableViewConfig";
import type { FormProps } from "../../../composables/form/types";
import type { QueryParamFilters } from "../../../composables/table-view/types";
import type { LocationQuery, LocationQueryValue } from "#dms/frontend-module";
import {
  TableRowAction,
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "./types";
import DmsForm from "../../../components/form/Form.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  type ActionConfirm,
  isConfirmFrom,
} from "#dms-core/app/types/confirm-dialog";
import { useActionConfirm } from "../confirm/useActionConfirm";
import { useActionTargets } from "../actions/useActionTargets";
import type { RowNavigationSource } from "../actions/rowNavigation";
import type { TableUrlScope } from "./utils/views";
import { TableViewEvents } from "../../../composables/table-view/types";
import {
  bulkActionConfirm,
  bulkActionOutcome,
  bulkActionQuery,
  bulkActionShortfall,
  type BulkActionKind,
  type BulkActionOutcome,
  type ConfirmedBulkAction,
} from "./utils/bulkActions";
import { resolveActionError } from "../../../composables/confirm/actionError";
import {
  ConfirmActionError,
  type ConfirmOptions,
  type ConfirmPartialOutcome,
  type ConfirmValues,
} from "../../../composables/confirm/types";
import {
  resolveFormContainerTexts,
  type TableViewFormKind,
} from "./utils/formTexts";

const DEFAULT_ROW_ID_KEY = "_id";
const DEFAULT_MODAL_SIZE = "xl";

const getItemId = (
  item: Data,
  idKey: string = DEFAULT_ROW_ID_KEY,
): string | undefined => {
  return get(item, idKey) ?? item._id ?? item.id;
};

interface TableRowActionsConfig {
  api: ReturnType<typeof $fetch.create>;
  location: string;
  caption?: string;
  labelKey?: string;
  rowIdKey?: string;
  refreshCallback?: () => void;
  formComponents: {
    new?: ComponentInfo<FormProps>;
    edit?: ComponentInfo<FormProps>;
    view?: ComponentInfo<FormProps>;
  };
  formContainer?: FormContainer;
  formPages?: FormPageUrls;
  routeParams?: Record<string, string>;
  componentId: string;
  pageId: string;
  queryParamFilters?: QueryParamFilters;
  /** The rows a row's drawer or modal steps through (J / K). */
  rowNavigation?: RowNavigationSource;
  /** Where a `deepLink` action writes its open row in the URL. */
  recordScope?: TableUrlScope;
}

interface BulkActionConfig {
  kind: BulkActionKind;
  method: HttpMethod;
  queryKey: string;
  successKey: string;
  errorKey: string;
}

/** Runs a confirmed action from inside its dialog (see `onConfirm`). */
type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;

/** Options of a delete: from the archive, it is a permanent one. */
interface DeleteRowsOptions {
  permanently?: boolean;
}

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

  const getContainerType = () =>
    config.formContainer?.type ?? DEFAULT_FORM_CONTAINER_TYPE;

  // When opening a form as a page, the current query is dropped by navigation.
  // Carry forward the params declared in `queryParamFilters` so the generated
  // form can resolve its `{{query.X}}` submitDefaults from the new page URL.
  const buildForwardedQuery = (): LocationQuery | undefined => {
    const params = config.queryParamFilters;
    if (!params) return undefined;

    const forwarded: Record<string, LocationQueryValue | LocationQueryValue[]> =
      {};
    for (const param of Object.keys(params)) {
      if (route.query[param] !== undefined) {
        forwarded[param] = route.query[param];
      }
    }
    return Object.keys(forwarded).length > 0 ? forwarded : undefined;
  };

  /**
   * Toasts a failed action that has no dialog to show it in: `title` names
   * what failed, the description is the server's message when it is meant
   * for users, else a translated fallback (never a raw error line).
   */
  const handleApiError = (error: unknown, title?: string) => {
    toast.add({
      color: Color.error,
      icon: "i-ph-warning-circle",
      title: title || t("dms.form.error_title"),
      description: resolveActionError(error, t),
    });
  };

  /** The form a row action opens: a duplicate opens the add form. */
  const formKindOf = (action: TableRowAction): TableViewFormKind => {
    if (action === TableRowAction.edit) return "edit";
    if (action === TableRowAction.view) return "view";
    return "new";
  };

  const buildContainerTexts = (action: TableRowAction, item: T | undefined) => {
    const kind = formKindOf(action);
    return resolveFormContainerTexts(
      {
        kind,
        pages: config.formContainer?.pages,
        caption: config.caption,
        recordLabel:
          item && config.labelKey && kind !== "new"
            ? get(item, config.labelKey)
            : undefined,
        locale: locale.value,
      },
      processI18n,
      t,
    );
  };

  const buildContainerIds = (action: TableRowAction, itemId?: string) => {
    const containerId = itemId
      ? `${config.pageId}-${config.componentId}-${action}-${itemId}`
      : `${config.pageId}-${config.componentId}-${action}`;
    const componentIdSuffix = action === "duplicate" ? "new" : action;
    const pageIdSuffix = itemId
      ? `${config.pageId}-${itemId}`
      : `${config.pageId}-new`;
    return { containerId, componentIdSuffix, pageIdSuffix };
  };

  const processFormOptions = (
    formComponent: ComponentInfo<FormProps>,
    itemId?: string,
  ) => {
    if (!itemId || !formComponent.options) return formComponent.options;
    return {
      ...formComponent.options,
      ...(formComponent.options.fetchUrl && {
        fetchUrl: formComponent.options.fetchUrl.replace(
          "{{params.id}}",
          itemId,
        ),
      }),
      ...(formComponent.options.submitUrl && {
        submitUrl: formComponent.options.submitUrl.replace(
          "{{params.id}}",
          itemId,
        ),
      }),
    };
  };

  const openModalContainer = (
    title: string,
    description: string,
    containerId: string,
    componentIdSuffix: string,
    pageIdSuffix: string,
    processedOptions: FormProps | undefined,
    fetchUrl?: string,
    submitDefaults?: Record<string, unknown>,
  ) => {
    const size =
      config.formContainer?.type === FormContainerType.modal &&
      config.formContainer.size
        ? config.formContainer.size
        : DEFAULT_MODAL_SIZE;

    const modal = openModal({
      title,
      description,
      size,
      containerId,
      component: DmsForm,
      componentOptions: {
        ...processedOptions,
        ...(fetchUrl && { fetchUrl }),
        ...(submitDefaults && { submitDefaults }),
        componentId: `${config.componentId}-${componentIdSuffix}`,
        pageId: pageIdSuffix,
        containerId,
        onSuccessCallback: () => {
          modal.close();
          config.refreshCallback?.();
        },
      },
    });
    return modal;
  };

  const openDrawerContainer = (
    title: string,
    description: string,
    containerId: string,
    componentIdSuffix: string,
    pageIdSuffix: string,
    processedOptions: FormProps | undefined,
    fetchUrl?: string,
    submitDefaults?: Record<string, unknown>,
  ) => {
    const drawer = openDrawer({
      title,
      description,
      containerId,
      component: DmsForm,
      componentOptions: {
        ...processedOptions,
        ...(fetchUrl && { fetchUrl }),
        ...(submitDefaults && { submitDefaults }),
        componentId: `${config.componentId}-${componentIdSuffix}`,
        pageId: pageIdSuffix,
        containerId,
        onSuccessCallback: () => {
          drawer.close();
          config.refreshCallback?.();
        },
      },
    });
    return drawer;
  };

  const containerHandlers: Record<string, (...args: unknown[]) => unknown> = {
    [FormContainerType.modal]: openModalContainer as (
      ...args: unknown[]
    ) => unknown,
    [FormContainerType.drawer]: openDrawerContainer as (
      ...args: unknown[]
    ) => unknown,
  };

  interface FormContainerConfig {
    action: TableRowAction;
    item?: T;
    itemId?: string;
    fetchUrl?: string;
    submitDefaults?: Record<string, unknown>;
  }

  interface ResolvedFormContainer {
    title: string;
    description: string;
    containerId: string;
    componentIdSuffix: string;
    pageIdSuffix: string;
    processedOptions: FormProps | undefined;
  }

  const resolveFormComponent = (action: TableRowAction) => {
    const mode =
      action === TableRowAction.duplicate ? TableRowAction.new : action;
    return config.formComponents[mode];
  };

  const buildResolvedFormContainer = (
    action: TableRowAction,
    item: T | undefined,
    itemId: string | undefined,
    formComponent: ComponentInfo<FormProps>,
  ): ResolvedFormContainer => {
    const { containerId, componentIdSuffix, pageIdSuffix } = buildContainerIds(
      action,
      itemId,
    );
    return {
      ...buildContainerTexts(action, item),
      containerId,
      componentIdSuffix,
      pageIdSuffix,
      processedOptions: processFormOptions(formComponent, itemId),
    };
  };

  const dispatchFormContainer = (
    containerType: FormContainerType,
    resolved: ResolvedFormContainer,
    containerConfig: FormContainerConfig,
  ) => {
    const { fetchUrl, submitDefaults } = containerConfig;

    const handler = containerHandlers[containerType];
    return handler?.(
      resolved.title,
      resolved.description,
      resolved.containerId,
      resolved.componentIdSuffix,
      resolved.pageIdSuffix,
      resolved.processedOptions,
      fetchUrl,
      submitDefaults,
    );
  };

  const createFormContainer = (containerConfig: FormContainerConfig) => {
    const formComponent = resolveFormComponent(containerConfig.action);
    if (!formComponent) {
      return;
    }

    const resolved = buildResolvedFormContainer(
      containerConfig.action,
      containerConfig.item,
      containerConfig.itemId,
      formComponent,
    );

    return dispatchFormContainer(getContainerType(), resolved, containerConfig);
  };

  const getErrorPayload = (error: unknown) => {
    const err = error as EventError;
    return err?.data || err?.message;
  };

  const openRowByIdImpl = (itemId: string, item?: T) => {
    const viewPageUrl = config.formPages?.view;
    if (getContainerType() === FormContainerType.page && viewPageUrl) {
      navigateDms(fillFormPageUrl(viewPageUrl, config.routeParams, itemId));
      return;
    }

    return createFormContainer({
      action: TableRowAction.view,
      item,
      itemId,
      fetchUrl: `${config.location}/get?id=${itemId}&action=details`,
    });
  };

  const editRowImpl = (item: T, submitDefaults?: Record<string, unknown>) => {
    const itemId = getItemId(item, config.rowIdKey ?? DEFAULT_ROW_ID_KEY);

    const editPageUrl = config.formPages?.edit;
    if (
      getContainerType() === FormContainerType.page &&
      itemId &&
      editPageUrl
    ) {
      const forwardedQuery = buildForwardedQuery();
      navigateDms({
        path: fillFormPageUrl(editPageUrl, config.routeParams, itemId),
        ...(forwardedQuery ? { query: forwardedQuery } : {}),
      });
      return;
    }

    return createFormContainer({
      action: TableRowAction.edit,
      item,
      itemId,
      submitDefaults,
    });
  };

  const newRowImpl = (submitDefaults?: Record<string, unknown>) => {
    const newPageUrl = config.formPages?.new;
    if (getContainerType() === FormContainerType.page && newPageUrl) {
      const forwardedQuery = buildForwardedQuery();
      navigateDms({
        path: fillFormPageUrl(newPageUrl, config.routeParams),
        ...(forwardedQuery ? { query: forwardedQuery } : {}),
      });
      return;
    }

    return createFormContainer({
      action: TableRowAction.new,
      submitDefaults,
    });
  };

  const duplicateRowImpl = (itemId: string) => {
    const newPageUrl = config.formPages?.new;
    if (getContainerType() === FormContainerType.page && newPageUrl) {
      navigateDms({
        path: fillFormPageUrl(newPageUrl, config.routeParams),
        query: { duplicate: itemId },
      });
      return;
    }

    return createFormContainer({
      action: TableRowAction.duplicate,
      itemId,
      fetchUrl: `${config.location}/get?id=${itemId}&action=duplicate`,
    });
  };

  const rowClickAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_CLICK,
      success: TableViewEvents.ROW_CLICK_SUCCESS,
      error: TableViewEvents.ROW_CLICK_ERROR,
    },
  });

  const rowEditAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_EDIT,
      success: TableViewEvents.ROW_EDIT_SUCCESS,
      error: TableViewEvents.ROW_EDIT_ERROR,
    },
  });

  const rowAddAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_ADD,
      success: TableViewEvents.ROW_ADD_SUCCESS,
      error: TableViewEvents.ROW_ADD_ERROR,
    },
  });

  const rowDuplicateAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_DUPLICATE,
      success: TableViewEvents.ROW_DUPLICATE_SUCCESS,
      error: TableViewEvents.ROW_DUPLICATE_ERROR,
    },
  });

  const openRowById = (itemId: string, item?: T) =>
    rowClickAction.execute(async () => openRowByIdImpl(itemId, item), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });

  const openRow = (item: T) => {
    const itemId = getItemId(item, config.rowIdKey ?? DEFAULT_ROW_ID_KEY);
    if (!itemId) return;
    return rowClickAction.execute(async () => openRowByIdImpl(itemId, item), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });
  };

  const editRow = (item: T, submitDefaults?: Record<string, unknown>) =>
    rowEditAction.execute(async () => editRowImpl(item, submitDefaults), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });

  const newRow = (submitDefaults?: Record<string, unknown>) =>
    rowAddAction.execute(async () => newRowImpl(submitDefaults), {
      startPayload: { action: "new" },
      successPayload: () => ({ action: "new" }),
      errorPayload: (error) => ({
        action: "new",
        error: getErrorPayload(error),
      }),
    });

  const duplicateRow = (itemId: string) =>
    rowDuplicateAction.execute(async () => duplicateRowImpl(itemId), {
      startPayload: { action: "duplicate", sourceId: itemId },
      successPayload: () => ({ action: "duplicate", sourceId: itemId }),
      errorPayload: (error) => ({
        action: "duplicate",
        sourceId: itemId,
        error: getErrorPayload(error),
      }),
    });

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
      () =>
        config.api(`${config.location}/${bulkConfig.kind}`, {
          method: bulkConfig.method,
          query: bulkActionQuery(bulkConfig.queryKey, ids),
          // The values of the confirmation's fields go with the request.
          ...(hasValues ? { body: values } : {}),
        }),
      {
        startPayload: { ids },
        successPayload: () => ({ ids }),
        errorPayload: (error) => ({ ids, error: getErrorPayload(error) }),
      },
    );
    return bulkActionOutcome(response, ids.length);
  };

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
        throw new ConfirmActionError(shortfall);
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
      handleApiError(error, t(bulkConfig.errorKey));
      return false;
    }
    const shortfall = bulkActionShortfall(bulkConfig.kind, outcome, t);
    if (outcome.processed === 0) {
      toast.add({
        color: Color.error,
        icon: "i-ph-warning-circle",
        title: shortfall?.title ?? t(bulkConfig.errorKey),
        description: shortfall?.description,
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

  /**
   * The confirmation a bulk action declares (`confirm`), for the rows it
   * reaches: a `from` dialog is worded for one row, so several rows keep the
   * generic confirmation. Undefined when none applies.
   */
  const declaredBulkConfirm = (
    actionConfig: boolean | RowActionConfig | undefined,
    ids: string[],
  ): ActionConfirm | undefined => {
    const declared = normalizeActionConfig(actionConfig).confirm;
    if (!declared) return undefined;
    return isConfirmFrom(declared) && ids.length !== 1 ? undefined : declared;
  };

  /** Asks the declared confirmation of a bulk action, running it inside. */
  const askDeclaredBulkConfirm = (
    declared: ActionConfirm,
    ids: string[],
    fallback: Partial<ConfirmOptions>,
    run: ConfirmedRun,
  ): Promise<boolean> =>
    confirmAction(declared, {
      urlParams: {
        id: ids[0],
        [config.rowIdKey ?? DEFAULT_ROW_ID_KEY]: ids[0],
      },
      // A fixed dialog names the rows it reaches.
      row: { count: ids.length },
      fallback,
      run,
    });

  /**
   * Asks before a bulk action, then runs it from inside the dialog: the
   * action's declared `confirm` (the server's own wording for a single row
   * with `{ from }`), else the generic confirmation, toned for the action
   * and counting the rows it reaches. Resolves whether rows went (false when
   * the user cancelled, or gave up after a failure), so a caller keeps its
   * selection otherwise.
   */
  const confirmBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    action: ConfirmedBulkAction,
    bulkConfig: BulkActionConfig,
  ): Promise<boolean> => {
    const fallback = bulkActionConfirm(action, ids.length, t);
    const run = bulkActionRun(ids, actionConfig, bulkConfig);
    const declared = declaredBulkConfirm(actionConfig, ids);
    if (declared) return askDeclaredBulkConfirm(declared, ids, fallback, run);
    return confirm({ ...fallback, onConfirm: run });
  };

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

  /**
   * Deletes rows once confirmed; resolves whether they went (false when the
   * user cancelled or the request failed), so a caller keeps its selection.
   */
  const deleteRows = async (
    ids: string[],
    deleteConfig: boolean | RowActionConfig | undefined,
    options: DeleteRowsOptions = {},
  ): Promise<boolean> => {
    if (!normalizeActionConfig(deleteConfig).isEnabled) return false;
    const action = options.permanently ? "deletePermanently" : "delete";
    return confirmBulkAction(ids, deleteConfig, action, DELETE_CONFIG);
  };

  const archiveRows = async (
    ids: string[],
    archiveConfig: boolean | RowActionConfig | undefined,
  ): Promise<boolean> => {
    if (!normalizeActionConfig(archiveConfig).isEnabled) return false;
    return confirmBulkAction(ids, archiveConfig, "archive", ARCHIVE_CONFIG);
  };

  // Restoring takes nothing away: it asks only when it declares a
  // confirmation, else it runs at once and its outcome is toasted.
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

  /**
   * Runs a built-in action (edit, details, duplicate, add…) after the
   * confirmation it declares, if any.
   */
  const runConfirmedBuiltIn = async (
    actionConfig: boolean | RowActionConfig | undefined,
    rowData: Data | undefined,
    proceed: () => unknown,
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

  const { handleCustomButton, handleCustomRowAction, handleBulkCustomAction } =
    useActionTargets({
      api: config.api,
      pageId: config.pageId,
      componentId: config.componentId,
      refreshCallback: config.refreshCallback,
      handleApiError,
      rowNavigation: config.rowNavigation,
      recordScope: config.recordScope,
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
    handleApiError,
    runConfirmedBuiltIn,
  };
};
