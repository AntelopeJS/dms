import type { FormContainer } from "./useTableViewConfig";
import type { FormProps } from "../../../composables/form/types";
import type { QueryParamFilters } from "../../../composables/table-view/types";
import type {
  LocationQuery,
  LocationQueryValue,
} from "#dms-inertia/frontend-module";
import {
  TableRowAction,
  FormContainerType,
  DEFAULT_FORM_CONTAINER_TYPE,
} from "./types";
import DmsForm from "../../../components/form/Form.vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import { TableViewEvents } from "../../../composables/table-view/types";

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
  componentId: string;
  pageId: string;
  queryParamFilters?: QueryParamFilters;
}

interface BulkActionConfig {
  endpoint: string;
  method: HttpMethod;
  queryKey: string;
  successKey: string;
  errorKey: string;
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

  const resolveFormPageUrl = (urlSlug: string): string => {
    if (urlSlug.startsWith("/")) return urlSlug;
    const baseSegments = route.path.replace(/\/$/, "").split("/");
    const parts = urlSlug.split("/");
    let popCount = 0;
    let partStart = 0;
    while (partStart < parts.length && parts[partStart] === "..") {
      popCount++;
      partStart++;
    }
    const base = baseSegments.slice(0, baseSegments.length - popCount);
    return [...base, ...parts.slice(partStart)].join("/");
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
    if (getContainerType() === FormContainerType.page) {
      const viewSlug = config.formContainer?.pages?.view?.urlSlug || ":id/view";
      const viewUrl = resolveFormPageUrl(viewSlug).replace(":id", itemId);
      navigateDms(viewUrl);
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

    if (getContainerType() === FormContainerType.page && itemId) {
      const editSlug = config.formContainer?.pages?.edit?.urlSlug || ":id/edit";
      const editUrl = resolveFormPageUrl(editSlug).replace(":id", itemId);
      const forwardedQuery = buildForwardedQuery();
      navigateDms({
        path: editUrl,
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
    if (getContainerType() === FormContainerType.page) {
      const newSlug = config.formContainer?.pages?.new?.urlSlug || "new";
      const forwardedQuery = buildForwardedQuery();
      navigateDms({
        path: resolveFormPageUrl(newSlug),
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
    if (getContainerType() === FormContainerType.page) {
      const newSlug = config.formContainer?.pages?.new?.urlSlug || "new";
      navigateDms({
        path: resolveFormPageUrl(newSlug),
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

  const performBulkAction = async (
    ids: string[],
    actionConfig: boolean | RowActionConfig | undefined,
    bulkConfig: BulkActionConfig,
  ) => {
    const normalized = normalizeActionConfig(actionConfig);
    if (!normalized.isEnabled) return;

    try {
      await bulkAction.execute(
        () =>
          config.api(`${config.location}/${bulkConfig.endpoint}`, {
            method: bulkConfig.method,
            query: { [bulkConfig.queryKey]: ids },
          }),
        {
          startPayload: { ids },
          successPayload: () => ({ ids }),
          errorPayload: (error) => ({ ids, error: getErrorPayload(error) }),
        },
      );

      toast.add({
        color: Color.success,
        title: t(bulkConfig.successKey, { count: ids.length }),
      });

      config.refreshCallback?.();
    } catch (error) {
      handleApiError(error, t(bulkConfig.errorKey));
    }
  };

  const deleteRows = async (
    ids: string[],
    deleteConfig: boolean | RowActionConfig | undefined,
  ) => {
    const isConfirmed = await confirm({
      title: t("dms.table.delete_confirm_title"),
      description: t("dms.table.delete_confirm_description", {
        count: ids.length,
      }),
      confirmLabel: t("dms.table.delete_confirm_button"),
      confirmColor: "error",
    });
    if (!isConfirmed) return;

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
  ) =>
    performBulkAction(ids, archiveConfig, {
      endpoint: "archive",
      method: HttpMethod.put,
      queryKey: "ids",
      successKey: "dms.table.archive_rows",
      errorKey: "dms.table.archive_error",
    });

  const restoreRows = async (
    ids: string[],
    restoreConfig: boolean | RowActionConfig | undefined,
  ) =>
    performBulkAction(ids, restoreConfig, {
      endpoint: "restore",
      method: HttpMethod.put,
      queryKey: "ids",
      successKey: "dms.table.restore_rows",
      errorKey: "dms.table.restore_error",
    });

  const handleApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
  ) => {
    if (target.confirm) {
      const isConfirmed = await confirm({
        title: processI18n(target.confirm.title),
        description: processI18n(target.confirm.description),
        confirmColor: target.confirm.confirmColor,
      });
      if (!isConfirmed) return;
    }

    try {
      await config.api(url, {
        method: target.method || HttpMethod.post,
      });
      toast.add({
        color: Color.success,
        title: processI18n(target.successMessage),
      });
      config.refreshCallback?.();
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
      await handleApiTarget(apiTarget, url);
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

  const handleCustomButton = (button: CustomButton) => {
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
