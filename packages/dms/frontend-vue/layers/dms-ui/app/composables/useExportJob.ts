import { h } from "vue";
import DmsExportToastContent from "../components/table-view/ExportToastContent.vue";

const POLLING_INTERVAL_MS = 400;
const EXPORT_TOAST_DURATION = 5000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TOAST_DURATION_UNTIL_REPLACED = ONE_HOUR_MS;
const FILENAME_HEADER_PATTERN = /filename="([^"]+)"/i;

function parseFilenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null;
  const match = header.match(FILENAME_HEADER_PATTERN);
  return match?.[1] ?? null;
}

type ProgressValue = number | null;

export interface ExportJobTicket {
  jobId: string;
  extension?: string;
  filename?: string;
}

export interface ExportJobStatusResponse {
  status: string;
  progress: number;
  error?: string;
  filename?: string;
  extension?: string;
}

export interface UseExportJobLabels {
  title: string;
  exporting: string;
  downloading: string;
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  fallbackErrorTitle: string;
  retry: string;
}

export interface RunExportJobOptions {
  startUrl: string;
  startMethod?: "GET" | "POST";
  startQuery?: Record<string, unknown>;
  startBody?: Record<string, unknown>;
  /** Function from jobId → URL. Defaults to `${startBase}/status/${jobId}`. */
  statusUrl?: (ticket: ExportJobTicket) => string;
  /** Function from jobId → URL. Defaults to `${startBase}/download/${jobId}`. */
  downloadUrl?: (ticket: ExportJobTicket) => string;
  /**
   * Fallback when the response headers carry no filename (headers always
   * win). Defaults to `${ticket.filename}.${extension}`, or
   * `export-${jobId}.${extension}` when the ticket has no filename.
   */
  fallbackFilename?: (ticket: ExportJobTicket) => string;
  /**
   * i18n labels override (defaults to `dms.table.export.*`, except
   * `fallbackErrorTitle` which defaults to `dms.form.error_title`).
   */
  labels?: Partial<UseExportJobLabels>;
  /** Show a retry button in the failure toast (defaults to true). */
  retryable?: boolean;
}

const EXPORT_STATUS_COMPLETED = "completed";
const EXPORT_STATUS_FAILED = "failed";

export const useExportJob = () => {
  const toast = useToast();
  const { t } = useI18n();
  const { processApiMessage } = useTranslation();
  const { $authFetch } = useAuthFetch();

  function resolveLabels(
    overrides?: Partial<UseExportJobLabels>,
  ): UseExportJobLabels {
    const merged = overrides ?? {};
    return {
      title: merged.title ?? t("dms.table.export.title"),
      exporting: merged.exporting ?? t("dms.table.export.exporting"),
      downloading: merged.downloading ?? t("dms.table.export.downloading"),
      successTitle: merged.successTitle ?? t("dms.table.export.success_title"),
      successMessage:
        merged.successMessage ?? t("dms.table.export.success_message"),
      errorTitle: merged.errorTitle ?? t("dms.table.export.error_title"),
      fallbackErrorTitle:
        merged.fallbackErrorTitle ?? t("dms.form.error_title"),
      retry: merged.retry ?? t("dms.table.export.retry"),
    };
  }

  function renderProgressDescription(label: string, progress: ProgressValue) {
    return () => h(DmsExportToastContent, { label, progress });
  }

  function createExportToast(labels: UseExportJobLabels) {
    return toast.add({
      color: Color.info,
      icon: "i-ph-export",
      title: labels.title,
      description: renderProgressDescription(labels.exporting, 0),
      duration: TOAST_DURATION_UNTIL_REPLACED,
      progress: false,
    });
  }

  function updateProgressToast(
    toastId: string | number,
    label: string,
    progress: ProgressValue,
  ) {
    toast.update(toastId, {
      description: renderProgressDescription(label, progress),
      duration: TOAST_DURATION_UNTIL_REPLACED,
      progress: false,
    });
  }

  function replaceProgressToast(
    toastId: string | number,
    payload: Parameters<typeof toast.add>[0],
  ): string | number {
    toast.remove(toastId);
    const next = toast.add(payload);
    return next.id;
  }

  function showSuccess(toastId: string | number, labels: UseExportJobLabels) {
    replaceProgressToast(toastId, {
      color: Color.success,
      icon: "i-ph-check-circle",
      title: labels.successTitle,
      description: labels.successMessage,
      duration: EXPORT_TOAST_DURATION,
      progress: true,
    });
  }

  function buildRetryActions(
    opts: RunExportJobOptions,
    labels: UseExportJobLabels,
    getCurrentToastId: () => string | number,
  ): { label: string; onClick: () => void }[] | undefined {
    if (opts.retryable === false) return undefined;
    return [
      {
        label: labels.retry,
        onClick: () => {
          toast.remove(getCurrentToastId());
          void runJob(opts);
        },
      },
    ];
  }

  function showFailure(
    toastId: string | number,
    opts: RunExportJobOptions,
    labels: UseExportJobLabels,
    error?: string,
  ): string | number {
    let newId: string | number = toastId;
    newId = replaceProgressToast(toastId, {
      color: Color.error,
      icon: "i-ph-warning",
      title: labels.errorTitle,
      description: error ? processApiMessage(error) : labels.fallbackErrorTitle,
      duration: EXPORT_TOAST_DURATION,
      progress: true,
      actions: buildRetryActions(opts, labels, () => newId),
    });
    return newId;
  }

  function showError(
    toastId: string | number,
    opts: RunExportJobOptions,
    labels: UseExportJobLabels,
    error: Error,
  ): string | number {
    let newId: string | number = toastId;
    newId = replaceProgressToast(toastId, {
      color: Color.error,
      icon: "i-ph-warning",
      title: labels.fallbackErrorTitle,
      description: processApiMessage(error.message),
      duration: EXPORT_TOAST_DURATION,
      progress: true,
      actions: buildRetryActions(opts, labels, () => newId),
    });
    return newId;
  }

  async function startJob(opts: RunExportJobOptions): Promise<ExportJobTicket> {
    const method = opts.startMethod ?? "POST";
    const init: Record<string, unknown> = { method };
    if (opts.startQuery) init.query = opts.startQuery;
    if (opts.startBody && method !== "GET") init.body = opts.startBody;
    const ticket = await $authFetch<ExportJobTicket>(opts.startUrl, init);
    return ticket;
  }

  function resolveStatusUrl(
    opts: RunExportJobOptions,
    ticket: ExportJobTicket,
  ): string {
    if (opts.statusUrl) return opts.statusUrl(ticket);
    const base = opts.startUrl.replace(/\/start$/, "");
    return `${base}/status/${ticket.jobId}`;
  }

  function resolveDownloadUrl(
    opts: RunExportJobOptions,
    ticket: ExportJobTicket,
  ): string {
    if (opts.downloadUrl) return opts.downloadUrl(ticket);
    const base = opts.startUrl.replace(/\/start$/, "");
    return `${base}/download/${ticket.jobId}`;
  }

  async function readStreamWithProgress(
    stream: ReadableStream<Uint8Array>,
    totalBytes: number,
    onProgress: (progress: ProgressValue) => void,
  ): Promise<Blob> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    onProgress(totalBytes > 0 ? 0 : null);

    let chunk = await reader.read();
    while (!chunk.done) {
      chunks.push(chunk.value);
      receivedBytes += chunk.value.length;
      if (totalBytes > 0) {
        onProgress(Math.floor((receivedBytes / totalBytes) * 100));
      }
      chunk = await reader.read();
    }

    if (totalBytes > 0 && receivedBytes !== totalBytes) {
      throw new Error(
        `Download incomplete: received ${receivedBytes} of ${totalBytes} bytes`,
      );
    }

    return new Blob(chunks as BlobPart[]);
  }

  async function pollStatus(
    statusUrl: string,
    toastId: string | number,
    labels: UseExportJobLabels,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const status = await $authFetch<ExportJobStatusResponse>(statusUrl);
          if (status.status === EXPORT_STATUS_COMPLETED) {
            clearInterval(interval);
            updateProgressToast(toastId, labels.exporting, 100);
            resolve();
            return;
          }
          if (status.status === EXPORT_STATUS_FAILED) {
            clearInterval(interval);
            reject(new Error(status.error));
            return;
          }
          updateProgressToast(toastId, labels.exporting, status.progress);
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, POLLING_INTERVAL_MS);
    });
  }

  async function downloadResult(
    downloadUrl: string,
    ticket: ExportJobTicket,
    fallbackFilename: (t: ExportJobTicket) => string,
    toastId: string | number,
    labels: UseExportJobLabels,
  ): Promise<void> {
    updateProgressToast(toastId, labels.downloading, 0);

    const response = await $authFetch.raw(downloadUrl, {
      responseType: "stream",
    });

    const stream = response._data as ReadableStream<Uint8Array> | null;
    if (!stream) throw new Error("Empty download stream");
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    const serverFilename = parseFilenameFromContentDisposition(
      response.headers.get("content-disposition"),
    );

    const blob = await readStreamWithProgress(stream, totalBytes, (progress) =>
      updateProgressToast(toastId, labels.downloading, progress),
    );

    const objectUrl = URL.createObjectURL(blob);
    try {
      const filename = serverFilename || fallbackFilename(ticket);
      downloadFile(objectUrl, filename);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function getErrorMessage(error: unknown): string | undefined {
    const err = error as { data?: unknown; message?: unknown };
    const data = err?.data as string | undefined;
    const message = err?.message as string | undefined;
    return data || message;
  }

  async function runJob(opts: RunExportJobOptions): Promise<void> {
    const labels = resolveLabels(opts.labels);
    const fallbackFilename =
      opts.fallbackFilename ??
      ((ticket: ExportJobTicket) =>
        ticket.filename
          ? `${ticket.filename}.${ticket.extension ?? "bin"}`
          : `export-${ticket.jobId}.${ticket.extension ?? "bin"}`);

    const exportToast = createExportToast(labels);

    try {
      const ticket = await startJob(opts);
      const statusUrl = resolveStatusUrl(opts, ticket);
      const downloadUrl = resolveDownloadUrl(opts, ticket);
      await pollStatus(statusUrl, exportToast.id, labels);
      await downloadResult(
        downloadUrl,
        ticket,
        fallbackFilename,
        exportToast.id,
        labels,
      );
      showSuccess(exportToast.id, labels);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message) showFailure(exportToast.id, opts, labels, message);
      else showError(exportToast.id, opts, labels, error as Error);
    }
  }

  return { runJob };
};
