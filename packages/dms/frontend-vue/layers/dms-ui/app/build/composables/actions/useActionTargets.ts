import { useClipboard } from "@vueuse/core";
import {
  type ActionConfirm,
  isConfirmFrom,
} from "#dms-core/app/types/confirm-dialog";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { Component } from "vue";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import type { CustomRowAction } from "../../../types/row-action";
import type {
  ConfirmOptions,
  ConfirmValues,
} from "../../../composables/confirm/types";
import { resolveResponseToast } from "../../utils/responseWarning";
import type { ContainerInstance } from "../../../composables/containers/types";
import {
  type BulkSelection,
  bulkSelectionQuery,
  targetWithSelection,
  withQuery,
} from "./bulkSelection";
import {
  listenRowSteps,
  type RowNavigation,
  type RowNavigationSource,
  rowNavigation,
} from "./rowNavigation";
import { writeRecordId } from "../table-view/utils/recordLink";
import type { TableUrlScope } from "../table-view/utils/views";
import { useActionConfirm } from "../confirm/useActionConfirm";
import {
  type ConfirmTranslate,
  resolveConfirmText,
} from "../confirm/confirmDialogTexts";
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
  /** The rows a drawer or modal opened on a row steps through (J / K). */
  rowNavigation?: RowNavigationSource;
  /** Where a `deepLink` action writes the row it has open in the URL. */
  recordScope?: TableUrlScope;
  /**
   * The field a row's id is read from (`_id` by default): it fills `{id}` in
   * the `from` URL of a row action's confirmation, as on a built-in action.
   */
  rowIdKey?: string;
}

const DEFAULT_ROW_ID_KEY = "_id";

/** How a target runs beyond its row. */
interface TargetRunExtras {
  /** The rows of a bulk action, handed to a drawer or modal. */
  selection?: BulkSelection;
  /** The open row is reflected in the URL. */
  deepLink?: boolean;
}

/** A drawer or modal to open, and on what. */
interface ComponentTargetRun extends TargetRunExtras {
  target: ActionTarget & { type: "modal" | "drawer" };
  title: string;
  description: string;
  containerId: string;
  rowData?: Data;
}

/**
 * Runs the target of a button or a row action (`ActionTarget`), after the
 * confirmation the action declares: a table's toolbar buttons and row
 * actions, and the buttons of a page header.
 */
export function useActionTargets(config: ActionTargetsConfig) {
  const toast = useToast();
  const { processI18n, processApiMessage } = useTranslation();
  const { t } = useI18n();
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
          // Pluralized on a bulk action's `{ count }`, like its dialog.
          title: resolveConfirmText(
            target.successMessage,
            rowData ?? {},
            t as ConfirmTranslate,
          ),
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

  const openContainer = (
    run: ComponentTargetRun,
    component: Component,
    componentOptions: Record<string, unknown>,
  ): ContainerInstance => {
    const options = {
      title: run.title,
      description: run.description,
      containerId: run.containerId,
      component,
      componentOptions,
    };
    return run.target.type === "modal"
      ? openModal({ ...options, size: run.target.size })
      : openDrawer({ ...options, direction: run.target.direction });
  };

  // A container opened on a listed row steps through the rows shown (its
  // `navigation` prop, J and K), mounting its component anew on each; a
  // deep-linked one keeps the row in the URL while it is open.
  const handleComponentTarget = (run: ComponentTargetRun) => {
    const componentName = run.target.component?.componentName;
    if (!componentName) return;
    const component = (resolveDmsComponent(componentName) ||
      componentName) as Component;
    const source = config.rowNavigation;
    let instance: ContainerInstance | undefined;
    let navigation: RowNavigation | undefined;
    const optionsFor = (row?: Data) => {
      navigation =
        row && source ? rowNavigation(source, row, showRow) : undefined;
      return {
        ...run.target.component?.options,
        pageId: config.pageId,
        componentId: config.componentId,
        containerId: run.containerId,
        rowData: row,
        navigation,
        selection: run.selection,
        onSuccessCallback: () => {
          instance?.close();
          config.refreshCallback?.();
        },
      };
    };
    const recordRow = (row?: Data) => {
      if (!run.deepLink || !config.recordScope || !source) return;
      writeRecordId(
        config.recordScope,
        row ? String(get(row, source.rowIdKey)) : undefined,
      );
    };
    function showRow(row: Data) {
      instance?.patch({
        componentOptions: optionsFor(row),
        componentKey: String(get(row, source!.rowIdKey)),
      });
      recordRow(row);
    }
    instance = openContainer(run, component, optionsFor(run.rowData));
    recordRow(run.rowData);
    const stopSteps = navigation ? listenRowSteps(() => navigation) : undefined;
    const settle = () => {
      stopSteps?.();
      recordRow(undefined);
    };
    instance.result.then(settle, settle);
  };

  type TargetHandler = (
    target: ActionTarget,
    label: string,
    rowData?: Data,
    extras?: TargetRunExtras,
  ) => Promise<void> | void;

  // A drawer or modal: a bulk action hands it the selection, not a row.
  const componentHandler: TargetHandler = (target, label, rowData, extras) =>
    handleComponentTarget({
      target: target as ActionTarget & { type: "modal" | "drawer" },
      title: processI18n((target as { title?: string }).title || label),
      description: processI18n(
        (target as { description?: string }).description || "",
      ),
      containerId: `${config.pageId}-${config.componentId}-${target.type}`,
      rowData: extras?.selection ? undefined : rowData,
      ...extras,
    });

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
    modal: componentHandler,
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
    drawer: componentHandler,
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

  // `{id}` of a confirmation's `from` URL, when the row carries an id.
  const rowUrlParams = (rowData?: Data) => {
    const id = rowData
      ? get(rowData, config.rowIdKey ?? DEFAULT_ROW_ID_KEY)
      : undefined;
    return id === undefined || id === null ? undefined : { id };
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
    extras?: TargetRunExtras,
  ) => {
    const handler = targetHandlers[target.type];
    if (!handler) return;
    if (!declared) {
      await handler(target, label, rowData, extras);
      return;
    }
    const runInside = confirmedRuns[target.type]?.(target, rowData);
    const isConfirmed = await confirmAction(declared, {
      row: rowData,
      urlParams: rowUrlParams(rowData),
      run: runInside,
    });
    if (isConfirmed && !runInside) {
      await handler(target, label, rowData, extras);
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
      { deepLink: action.deepLink },
    );
  };

  /**
   * Runs a bulk custom action on the selection: a URL target carries the
   * ids (or the filters of "Select all N matching") in its query, a drawer
   * or modal receives `selection`, and the texts receive `{ count }`.
   */
  const handleBulkCustomAction = (
    action: CustomRowAction,
    selection: BulkSelection,
  ) => {
    const query = bulkSelectionQuery(selection);
    const declared =
      action.confirm && isConfirmFrom(action.confirm)
        ? { from: withQuery(action.confirm.from, query) }
        : action.confirm;
    void handleActionTarget(
      targetWithSelection(action.target, query),
      action.label,
      { count: selection.count },
      declared,
      { selection },
    );
  };

  return { handleCustomButton, handleCustomRowAction, handleBulkCustomAction };
}
