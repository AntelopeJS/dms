import { useClipboard } from "@vueuse/core";
import type { ActionConfirm } from "#dms-core/app/types/confirm-dialog";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import type { CustomRowAction } from "../../../types/row-action";
import type {
  ConfirmOptions,
  ConfirmValues,
} from "../../../composables/confirm/types";
import { resolveResponseToast } from "../../../utils/responseWarning";
import { useActionConfirm } from "../confirm/useActionConfirm";
import {
  dispatchQuickActionTarget,
  findServedQuickAction,
} from "../../utils/dispatchQuickActionTarget";

/** Runs a confirmed action from inside its dialog (see `onConfirm`). */
type ConfirmedRun = NonNullable<ConfirmOptions["onConfirm"]>;

/** Where the buttons run: the requests they send, what they refresh. */
export interface ActionTargetsConfig {
  api: ReturnType<typeof $fetch.create>;
  /** Ids the drawers and modals the targets open are keyed by. */
  pageId: string;
  componentId: string;
  /** Called once a target changed something (an API call, a closed form). */
  refreshCallback?: () => void;
  /** Toasts a failure no dialog shows. */
  handleApiError: (error: unknown, title?: string) => void;
}

/**
 * Runs the target of a button or a row action (`ActionTarget`), after the
 * confirmation the action declares: a table's toolbar buttons and row
 * actions, and the buttons of a page header.
 */
export function useActionTargets(config: ActionTargetsConfig) {
  const toast = useToast();
  const { processI18n, processApiMessage } = useTranslation();
  const { open: openModal } = useModal();
  const { open: openDrawer } = useDrawer();
  const { runJob: runExportJob } = useExportJob();
  const { copy: copyToClipboard } = useClipboard({ legacy: true });
  const { confirmAction } = useActionConfirm();
  const { handleApiError } = config;

  /** Calls an `api` target and tells how it went (rejects on a failure). */
  const requestApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    rowData?: Data,
    values: ConfirmValues = {},
  ) => {
    // The confirmation's values join the declared body, the input winning.
    const body = { ...target.body, ...values };
    const response = await config.api<Record<string, unknown> | undefined>(
      url,
      {
        method: target.method || HttpMethod.post,
        ...(Object.keys(body).length > 0 ? { body } : {}),
      },
    );
    if (target.copy) {
      await copyToClipboard(String(response?.[target.copy] ?? ""));
    }
    toast.add(
      resolveResponseToast(
        response,
        {
          color: Color.success,
          title: processI18n(target.successMessage, rowData),
        },
        { processI18n, processApiMessage },
      ),
    );
    // A read-only call (a link to copy) changes no row.
    if (target.method !== "GET") config.refreshCallback?.();
  };

  // A direct call toasts a refusal; a confirmed one runs inside its dialog
  // (see `confirmedRuns`).
  const handleApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    label: string,
    rowData?: Data,
  ) => {
    try {
      await requestApiTarget(target, url, rowData);
    } catch (error: unknown) {
      handleApiError(error, label ? processI18n(label, rowData) : undefined);
    }
  };

  const handleExportJobTarget = async (
    target: ActionTarget & { type: "exportJob" },
    url: string,
    rowData?: Data,
  ) => {
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
    api: async (target, label, rowData) => {
      const apiTarget = target as ActionTarget & { type: "api" };
      const url = rowData
        ? interpolateUrl(apiTarget.url, rowData)
        : apiTarget.url;
      await handleApiTarget(apiTarget, url, label, rowData);
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
    // Runs the quick action as the command palette does; one the user is not
    // served runs nothing.
    quickAction: (target) => {
      const { id } = target as ActionTarget & { type: "quickAction" };
      const quickAction = findServedQuickAction(
        useSiteLayout().quickActions.value?.actions,
        id,
      );
      if (quickAction) dispatchQuickActionTarget(quickAction.target);
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

  const targetUrl = (url: string, rowData?: Data): string =>
    rowData ? interpolateUrl(url, rowData) : url;

  // A target making a request runs it from inside its confirmation, which
  // shows a refusal (under its field when it names one) and stays open; any
  // other runs once confirmed.
  const confirmedRuns: Partial<
    Record<
      ActionTarget["type"],
      (target: ActionTarget, rowData?: Data) => ConfirmedRun
    >
  > = {
    api: (target, rowData) => (values) => {
      const apiTarget = target as ActionTarget & { type: "api" };
      return requestApiTarget(
        apiTarget,
        targetUrl(apiTarget.url, rowData),
        rowData,
        values,
      );
    },
  };

  /**
   * Runs an action's target, after its confirmation when it declares one.
   * On a row action, the dialog's texts take the row's fields as parameters
   * ("Make {name} an owner?").
   */
  const handleActionTarget = async (
    target: ActionTarget,
    label: string,
    rowData?: Data,
    declared?: ActionConfirm,
  ) => {
    const handler = targetHandlers[target.type];
    if (!handler) return;
    if (!declared) {
      await handler(target, label, rowData);
      return;
    }
    const runInside = confirmedRuns[target.type]?.(target, rowData);
    const isConfirmed = await confirmAction(declared, {
      row: rowData,
      run: runInside,
    });
    if (isConfirmed && !runInside) await handler(target, label, rowData);
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
    void handleActionTarget(
      button.target,
      button.label,
      undefined,
      button.confirm,
    );
  };

  const handleCustomRowAction = (action: CustomRowAction, rowData?: Data) => {
    void handleActionTarget(
      action.target,
      action.label,
      rowData,
      action.confirm,
    );
  };

  return { handleCustomButton, handleCustomRowAction };
}
