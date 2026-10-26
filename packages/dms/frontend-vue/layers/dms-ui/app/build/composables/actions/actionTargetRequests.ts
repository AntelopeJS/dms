import type { UseClipboardReturn } from "@vueuse/core";
import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { ConfirmValues } from "../../../composables/confirm/types";
import type { ActionTargetsConfig } from "./useActionTargets";
import type { BulkSelection } from "./bulkSelection";
import { resolveResponseToast } from "../../utils/responseWarning";
import { resolveConfirmText } from "../confirm/confirmDialogTexts";
import { readBulkCount } from "../table-view/utils/bulkActions";
import { saveDownload } from "../../utils/fileDownload";
import { downloadTargetFilename, targetUrl } from "./actionTargetUrl";

const JOB_ID_TOKEN = /\{\{\s*job\.id\s*\}\}/g;

export function createExportJobHandler(
  runExportJob: ReturnType<typeof useExportJob>["runJob"],
  processI18n: ReturnType<typeof useTranslation>["processI18n"],
) {
  return async (
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
      targetUrl(
        template.replace(JOB_ID_TOKEN, encodeURIComponent(ticket.jobId)),
        rowData,
      );
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
}

export interface ActionRequestServices {
  toast: ReturnType<typeof useToast>;
  processI18n: ReturnType<typeof useTranslation>["processI18n"];
  processApiMessage: ReturnType<typeof useTranslation>["processApiMessage"];
  handleApiError: ActionTargetsConfig["handleApiError"];
  t: ReturnType<typeof useI18n>["t"];
  copyToClipboard: UseClipboardReturn<false>["copy"];
  fetchRaw: ReturnType<typeof useAuthFetch>["$authFetch"]["raw"];
}

export function createActionRequests(
  config: ActionTargetsConfig,
  services: ActionRequestServices,
) {
  const {
    toast,
    processI18n,
    processApiMessage,
    handleApiError,
    t,
    copyToClipboard,
    fetchRaw,
  } = services;
  const requestApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    rowData?: Data,
    values: ConfirmValues = {},
    selection?: BulkSelection,
  ) => {
    const body = { ...target.body, ...values };
    const response = await config.api<Data | undefined>(url, {
      method: target.method || HttpMethod.post,
      ...(Object.keys(body).length > 0 ? { body } : undefined),
    });
    if (target.copy)
      await copyToClipboard(String(response?.[target.copy] ?? ""));
    const toastParams = selection
      ? { ...rowData, count: readBulkCount(response) ?? selection.count }
      : (rowData ?? {});
    toast.add(
      resolveResponseToast(
        response,
        {
          color: Color.success,
          title: resolveConfirmText(target.successMessage, toastParams, t),
        },
        { processI18n, processApiMessage },
      ),
    );
    if (target.method !== "GET") config.refreshCallback?.();
  };
  const handleApiTarget = async (
    target: ActionTarget & { type: "api" },
    url: string,
    label: string,
    rowData?: Data,
    selection?: BulkSelection,
  ) => {
    try {
      await requestApiTarget(target, url, rowData, {}, selection);
    } catch (error: unknown) {
      handleApiError(error, label ? processI18n(label, rowData) : undefined);
    }
  };
  const handleDownloadTarget = async (
    target: ActionTarget & { type: "download" },
    label: string,
    rowData?: Data,
  ) => {
    try {
      await saveDownload(
        {
          url: targetUrl(target.url, rowData),
          filename: downloadTargetFilename(target.filename, rowData),
        },
        fetchRaw,
      );
    } catch (error: unknown) {
      handleApiError(error, label ? processI18n(label, rowData) : undefined);
    }
  };
  return { requestApiTarget, handleApiTarget, handleDownloadTarget };
}
