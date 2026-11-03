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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Export endpoints own query values; the fetch owner's broader query type would widen this existing object contract.
  startQuery?: Record<string, unknown>;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Export endpoints own body values; the fetch owner's body type also admits non-object payloads excluded by this contract.
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

function resolveExportLabels(
  t: ReturnType<typeof useI18n>["t"],
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
    fallbackErrorTitle: merged.fallbackErrorTitle ?? t("dms.form.error_title"),
    retry: merged.retry ?? t("dms.table.export.retry"),
  };
}

function createExportToasts(
  runJob: (opts: RunExportJobOptions) => Promise<void>,
) {
  const toast = useToast();
  const { t } = useI18n();
  const { presentError } = useApiErrorPresenter();
  const { $authFetch } = useAuthFetch();

  function resolveLabels(
    overrides?: Partial<UseExportJobLabels>,
  ): UseExportJobLabels {
    return resolveExportLabels(t, overrides);
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
    getCurrentToastId: () => string | number,
  ): ApiErrorAction[] | undefined {
    if (opts.retryable === false) return undefined;
    return [
      {
        labelKey: opts.labels?.retry ?? "dms.table.export.retry",
        onSelect: () => {
          toast.remove(getCurrentToastId());
          void runJob(opts);
        },
      },
    ];
  }

  function showFailure(
    toastId: string | number,
    opts: RunExportJobOptions,
    error: unknown,
  ): void {
    presentError(error, {
      fallbackKey: opts.labels?.errorTitle ?? "dms.table.export.error_title",
      replaceToastId: toastId,
      actions: buildRetryActions(opts, () => toastId),
    });
  }

  return {
    $authFetch,
    resolveLabels,
    createExportToast,
    updateProgressToast,
    showSuccess,
    showFailure,
  };
}

function createExportTransport(context: ReturnType<typeof createExportToasts>) {
  const { $authFetch, updateProgressToast } = context;

  async function startJob(opts: RunExportJobOptions): Promise<ExportJobTicket> {
    const method = opts.startMethod ?? "POST";
    const init: NonNullable<Parameters<typeof $authFetch<ExportJobTicket>>[1]> =
      { method };
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

    const response = await $authFetch.raw<
      ReadableStream<Uint8Array> | null,
      "stream"
    >(downloadUrl, {
      responseType: "stream",
    });

    const stream = response._data;
    if (!stream) throw new Error("Empty download stream");
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    const serverFilename = parseFilenameFromContentDisposition(
      response.headers.get("content-disposition"),
    );

    const blob = await readExportStream(stream, totalBytes, (progress) =>
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

  return {
    startJob,
    resolveStatusUrl,
    resolveDownloadUrl,
    pollStatus,
    downloadResult,
  };
}

async function readExportStream(
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

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Reader chunks are not checked for SharedArrayBuffer backing; preserve Blob's existing rejection rather than copy or validate the bytes.
  return new Blob(chunks as BlobPart[]);
}

export const useExportJob = () => {
  const context = createExportToasts((opts) => runJob(opts));
  const { resolveLabels, createExportToast, showSuccess, showFailure } =
    context;
  const {
    startJob,
    resolveStatusUrl,
    resolveDownloadUrl,
    pollStatus,
    downloadResult,
  } = createExportTransport(context);

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
      showFailure(exportToast.id, opts, error);
    }
  }

  return { runJob };
};
