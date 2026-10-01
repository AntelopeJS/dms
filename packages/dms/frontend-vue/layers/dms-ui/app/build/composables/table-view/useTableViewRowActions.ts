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
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { RowActionConfirmDescriptor } from "#dms-core/app/types/row-action";
import { useClipboard } from "@vueuse/core";
import { TableViewEvents } from "../../../composables/table-view/types";
import {
  bulkActionConfirm,
  bulkActionOutcome,
  bulkActionQuery,
  type BulkActionConfirm,
  type ConfirmedBulkAction,
} from "./utils/bulkActions";

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
  /**
   * The table view's key (`tableViewKey` of its options): sent with every
   * write so the server applies this table's permission and row rules.
   */
  tableViewKey?: string;
}

interface BulkActionConfig {
  endpoint: string;
  method: HttpMethod;
  queryKey: string;
  successKey: string;
  errorKey: string;
}

/** Options of a delete: from the archive, it is a permanent one. */
interface DeleteRowsOptions {
  permanently?: boolean;
}

export const useTableRowActions = <T extends Data>(
  config: TableRowActionsConfig,
) => {
  const toast = useToast();
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const { processI18n, processApiMessage } = useTranslation();
  const { open: openModal } = useModal();
  const { open: openDrawer } = useDrawer();
  const route = useDmsRoute();
  const { runJob: runExportJob } = useExportJob();
  const { copy: copyToClipboard } = useClipboard({ legacy: true });

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

  const handleApiError = (error: unknown, defaultMessage: string) => {
    const err = error as Record<string, unknown>;
    const errData = err?.data as Record<string, unknown> | string | undefined;
    const message =
      (typeof errData === "object" ? errData?.message : errData) ||
      err?.message ||
      defaultMessage;
    toast.add({
      color: Color.error,
      title: t("dms.form.error_title"),
      description: processApiMessage(String(message)),
    });
  };

  const buildContainerTitle = (
    action: TableRowAction,
    item: T | undefined,
    titleKey: string,
  ): string => {
    const titleParts: string[] = [];

    if (
      item &&
      config.labelKey &&
      (action === TableRowAction.edit || action === TableRowAction.view)
    ) {
      const label = item[config.labelKey];
      if (label) {
        titleParts.push(String(label));
      }
    }

    if (config.caption) {
      titleParts.push(processI18n(config.caption));
    }

    titleParts.push(t(titleKey));
    return titleParts.join(" - ");
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
    descriptionKey: string,
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
      description: t(descriptionKey),
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
    descriptionKey: string,
    containerId: string,
    componentIdSuffix: string,
    pageIdSuffix: string,
    processedOptions: FormProps | undefined,
    fetchUrl?: string,
    submitDefaults?: Record<string, unknown>,
  ) => {
    const drawer = openDrawer({
      title,
      description: t(descriptionKey),
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
    titleKey: string;
    descriptionKey: string;
    fetchUrl?: string;
    submitDefaults?: Record<string, unknown>;
  }

  interface ResolvedFormContainer {
    title: string;
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
    titleKey: string,
    formComponent: ComponentInfo<FormProps>,
  ): ResolvedFormContainer => {
    const { containerId, componentIdSuffix, pageIdSuffix } = buildContainerIds(
      action,
      itemId,
    );
    return {
      title: buildContainerTitle(action, item, titleKey),
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
    const { descriptionKey, fetchUrl, submitDefaults } = containerConfig;

    const handler = containerHandlers[containerType];
    return handler?.(
      resolved.title,
      descriptionKey,
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
      containerConfig.titleKey,
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
      titleKey: "dms.table.view_item",
      descriptionKey: "dms.table.view_item_description",
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
      titleKey: "dms.table.edit_item",
      descriptionKey: "dms.table.edit_item_description",
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
      titleKey: "dms.table.new_item",
      descriptionKey: "dms.table.new_item_description",
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
      titleKey: "dms.table.new_item",
      descriptionKey: "dms.table.new_item_description",
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

  /** Runs a bulk action; resolves whether the request went through. */
  const performBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    bulkConfig: BulkActionConfig,
  ): Promise<boolean> => {
    const normalized = normalizeActionConfig(actionConfig);
    if (!normalized.isEnabled) return false;

    try {
      const response = await bulkAction.execute(
        () =>
          config.api(`${config.location}/${bulkConfig.endpoint}`, {
            method: bulkConfig.method,
            query: bulkActionQuery(
              bulkConfig.queryKey,
              ids,
              config.tableViewKey,
            ),
          }),
        {
          startPayload: { ids },
          successPayload: () => ({ ids }),
          errorPayload: (error) => ({ ids, error: getErrorPayload(error) }),
        },
      );

      // Rows a row rule refuses are left out by the server: the toast counts
      // what changed and says how many were skipped.
      const { processed, skipped } = bulkActionOutcome(response, ids.length);
      toast.add({
        color: processed === 0 ? Color.warning : Color.success,
        title: normalized.successMessage
          ? processI18n(normalized.successMessage, { count: processed })
          : t(bulkConfig.successKey, { count: processed }, processed),
        description: skipped
          ? t("dms.table.bulk_skipped", { count: skipped }, skipped)
          : undefined,
      });

      config.refreshCallback?.();
      return true;
    } catch (error) {
      handleApiError(error, t(bulkConfig.errorKey));
      return false;
    }
  };

  /**
   * The confirmation the server words for one row (`confirmFrom`): what the
   * action takes with it, or why it cannot run (a `blocked` descriptor only
   * explains, and resolves false).
   */
  const confirmFromServer = async (
    template: string,
    id: string,
    fallback: BulkActionConfirm,
  ): Promise<boolean> => {
    const url = interpolateUrl(template, {
      id,
      [config.rowIdKey ?? DEFAULT_ROW_ID_KEY]: id,
    });
    let descriptor: RowActionConfirmDescriptor;
    try {
      descriptor = await config.api<RowActionConfirmDescriptor>(url);
    } catch (error) {
      handleApiError(error, t("dms.form.error_unknown"));
      return false;
    }
    const text = (value: string | undefined) =>
      value ? processI18n(value, descriptor.params) : undefined;
    const isConfirmed = await confirm({
      title: text(descriptor.title) ?? "",
      description: text(descriptor.description) ?? "",
      icon: descriptor.icon ?? fallback.icon,
      confirmColor: descriptor.confirmColor ?? fallback.confirmColor,
      confirmLabel: text(descriptor.confirmLabel),
      confirmIcon: descriptor.confirmIcon,
      cancelLabel: text(descriptor.cancelLabel),
      hideConfirm: descriptor.blocked,
      impact: descriptor.impact?.map((entry) => ({
        icon: entry.icon,
        label: text(entry.label) ?? "",
        count:
          typeof entry.count === "string" ? text(entry.count) : entry.count,
      })),
    });
    return isConfirmed && !descriptor.blocked;
  };

  /**
   * Asks before a bulk action: the server's own wording for a single row when
   * the action declares `confirmFrom`, else the generic confirmation, toned
   * for the action and counting the rows it reaches.
   */
  const confirmBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    action: ConfirmedBulkAction,
  ): Promise<boolean> => {
    const fallback = bulkActionConfirm(action, ids.length, t);
    const { confirmFrom } = normalizeActionConfig(actionConfig);
    if (confirmFrom && ids.length === 1) {
      return confirmFromServer(confirmFrom, ids[0]!, fallback);
    }
    return confirm(fallback);
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
    if (!(await confirmBulkAction(ids, deleteConfig, action))) return false;

    return performBulkAction(ids, deleteConfig, {
      endpoint: "delete",
      method: HttpMethod.delete,
      queryKey: "id",
      successKey: "dms.table.delete_rows",
      errorKey: "dms.table.delete_error",
    });
  };

  const archiveRows = async (
    ids: string[],
    archiveConfig: boolean | RowActionConfig | undefined,
  ): Promise<boolean> => {
    if (!normalizeActionConfig(archiveConfig).isEnabled) return false;
    if (!(await confirmBulkAction(ids, archiveConfig, "archive"))) return false;
    return performBulkAction(ids, archiveConfig, {
      endpoint: "archive",
      method: HttpMethod.put,
      queryKey: "ids",
      successKey: "dms.table.archive_rows",
      errorKey: "dms.table.archive_error",
    });
  };

  // Restoring takes nothing away: it asks only when the server words a
  // confirmation for the row (`confirmFrom`).
  const restoreRows = async (
    ids: string[],
    restoreConfig: boolean | RowActionConfig | undefined,
  ): Promise<boolean> => {
    const { confirmFrom } = normalizeActionConfig(restoreConfig);
    if (confirmFrom && ids.length === 1) {
      const fallback: BulkActionConfirm = {
        title: "",
        description: "",
        confirmLabel: t("dms.button.restore"),
        confirmColor: "primary",
        icon: "i-ph-arrow-counter-clockwise",
      };
      if (!(await confirmFromServer(confirmFrom, ids[0]!, fallback))) {
        return false;
      }
    }
    return performBulkAction(ids, restoreConfig, {
      endpoint: "restore",
      method: HttpMethod.put,
      queryKey: "ids",
      successKey: "dms.table.restore_rows",
      errorKey: "dms.table.restore_error",
    });
  };

  // On a row action, the texts take the row's fields as parameters
  // ("Make {name} an owner?").
  const handleApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    rowData?: Data,
  ) => {
    if (target.confirm) {
      const text = (value: string | undefined) =>
        value ? processI18n(value, rowData) : undefined;
      const isConfirmed = await confirm({
        title: text(target.confirm.title) ?? "",
        description: text(target.confirm.description) ?? "",
        confirmColor: target.confirm.confirmColor,
        icon: target.confirm.icon,
        confirmLabel: text(target.confirm.confirmLabel),
      });
      if (!isConfirmed) return;
    }

    try {
      const response = await config.api<Record<string, unknown> | undefined>(
        url,
        {
          method: target.method || HttpMethod.post,
          ...(target.body ? { body: target.body } : {}),
        },
      );
      if (target.copy) {
        await copyToClipboard(String(response?.[target.copy] ?? ""));
      }
      toast.add({
        color: Color.success,
        title: processI18n(target.successMessage, rowData),
      });
      // A read-only call (a link to copy) changes no row.
      if (target.method !== "GET") config.refreshCallback?.();
    } catch (error: unknown) {
      handleApiError(error, t("dms.form.error_unknown"));
    }
  };

  const handleExportJobTarget = async (
    target: ActionTarget & { type: "exportJob" },
    url: string,
    rowData?: Data,
  ) => {
    if (target.confirm) {
      const isConfirmed = await confirm({
        title: processI18n(target.confirm.title),
        description: processI18n(target.confirm.description),
        confirmColor: target.confirm.confirmColor,
      });
      if (!isConfirmed) return;
    }
    const labels = target.labels
      ? {
          title: target.labels.title
            ? processI18n(target.labels.title)
            : undefined,
          exporting: target.labels.exporting
            ? processI18n(target.labels.exporting)
            : undefined,
          downloading: target.labels.downloading
            ? processI18n(target.labels.downloading)
            : undefined,
          successTitle: target.labels.successTitle
            ? processI18n(target.labels.successTitle)
            : undefined,
          successMessage: target.labels.successMessage
            ? processI18n(target.labels.successMessage)
            : undefined,
          errorTitle: target.labels.errorTitle
            ? processI18n(target.labels.errorTitle)
            : undefined,
          retry: target.labels.retry
            ? processI18n(target.labels.retry)
            : undefined,
        }
      : undefined;
    const statusUrlTemplate = target.statusUrl;
    const downloadUrlTemplate = target.downloadUrl;
    const interpolate = (template: string, ticket: ExportJobTicket): string =>
      interpolateUrl(template, { ...(rowData ?? {}), jobId: ticket.jobId });
    await runExportJob({
      startUrl: url,
      startMethod: target.method ?? "POST",
      statusUrl: statusUrlTemplate
        ? (ticket) => interpolate(statusUrlTemplate, ticket)
        : undefined,
      downloadUrl: downloadUrlTemplate
        ? (ticket) => interpolate(downloadUrlTemplate, ticket)
        : undefined,
      labels,
    });
  };

  const handleComponentTarget = (
    target: ActionTarget & { type: "modal" | "drawer" },
    title: string,
    description: string,
    containerId: string,
    rowData?: Data,
  ) => {
    const componentName = target.component?.componentName;
    if (!componentName) {
      return;
    }
    const vueComponent = resolveDmsComponent(componentName) || componentName;

    const componentOptions = {
      ...target.component?.options,
      pageId: config.pageId,
      componentId: config.componentId,
      containerId,
      rowData,
    };

    if (target.type === "modal") {
      const modal = openModal({
        title,
        description,
        size: (target as ActionTarget & { type: "modal" }).size,
        containerId,
        component: vueComponent as Component,
        componentOptions: {
          ...componentOptions,
          onSuccessCallback: () => {
            modal.close();
            config.refreshCallback?.();
          },
        },
      });
      return;
    }

    const drawer = openDrawer({
      title,
      description,
      containerId,
      component: vueComponent as Component,
      componentOptions: {
        ...componentOptions,
        onSuccessCallback: () => {
          drawer.close();
          config.refreshCallback?.();
        },
      },
    });
  };

  type TargetHandler = (
    target: ActionTarget,
    label: string,
    rowData?: Data,
  ) => Promise<void> | void;

  const targetHandlers: Record<string, TargetHandler> = {
    page: (target, _label, rowData) => {
      const pageTarget = target as ActionTarget & { type: "page" };
      const url = rowData
        ? interpolateUrl(pageTarget.url, rowData)
        : pageTarget.url;
      navigateDms(url);
    },
    external: (target, _label, rowData) => {
      const externalTarget = target as ActionTarget & { type: "external" };
      const url = rowData
        ? interpolateUrl(externalTarget.url, rowData)
        : externalTarget.url;
      if (typeof window === "undefined" || !url) return;
      if (externalTarget.newTab) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.href = url;
    },
    api: async (target, _label, rowData) => {
      const apiTarget = target as ActionTarget & { type: "api" };
      const url = rowData
        ? interpolateUrl(apiTarget.url, rowData)
        : apiTarget.url;
      await handleApiTarget(apiTarget, url, rowData);
    },
    exportJob: async (target, _label, rowData) => {
      const jobTarget = target as ActionTarget & { type: "exportJob" };
      const url = rowData
        ? interpolateUrl(jobTarget.url, rowData)
        : jobTarget.url;
      await handleExportJobTarget(jobTarget, url, rowData);
    },
    modal: (target, label, rowData) => {
      const title = processI18n((target as { title?: string }).title || label);
      const description = processI18n(
        (target as { description?: string }).description || "",
      );
      const containerId = `${config.pageId}-${config.componentId}-${target.type}`;
      handleComponentTarget(
        target as ActionTarget & { type: "modal" },
        title,
        description,
        containerId,
        rowData,
      );
    },
    drawer: (target, label, rowData) => {
      const title = processI18n((target as { title?: string }).title || label);
      const description = processI18n(
        (target as { description?: string }).description || "",
      );
      const containerId = `${config.pageId}-${config.componentId}-${target.type}`;
      handleComponentTarget(
        target as ActionTarget & { type: "drawer" },
        title,
        description,
        containerId,
        rowData,
      );
    },
  };

  const handleActionTarget = async (
    target: ActionTarget,
    label: string,
    rowData?: Data,
  ) => {
    const handler = targetHandlers[target.type];
    if (handler) {
      await handler(target, label, rowData);
    }
  };

  // Reached for a disabled button only through a quick action, which presses
  // it by id: the reason is told instead of the target being opened.
  const handleCustomButton = (button: CustomButton) => {
    if (button.disabled) {
      toast.add({
        color: Color.warning,
        title: processI18n(button.label),
        description: button.disabledReason
          ? processI18n(button.disabledReason)
          : undefined,
      });
      return;
    }
    handleActionTarget(button.target, button.label);
  };

  const handleCustomRowAction = (action: CustomRowAction, rowData?: Data) => {
    handleActionTarget(action.target, action.label, rowData);
  };

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
    handleApiError,
  };
};
