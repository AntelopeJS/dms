import type {
  ConfirmDialogDownloadTarget,
  ConfirmDialogLinkTarget,
  ConfirmDialogSecondaryTarget,
} from "#dms-core/app/types/confirm-dialog";
import { downloadFile } from "#dms-core/app/utils/downloadFile";
import type { SecondaryTargetRun } from "./confirmDialogTexts";

/** The response a download reads: its body and its headers. */
export interface DownloadResponse {
  _data?: Blob;
  headers: Headers;
}

/** Fetches a download with the user's session (`$authFetch.raw`). */
export type DownloadFetch = (
  url: string,
  options: { responseType: "blob" },
) => Promise<DownloadResponse>;

const DISPOSITION_NAME = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i;
const FALLBACK_FILENAME = "download";

// A malformed escape is kept as written rather than failing the download.
function decodeName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The name a download is saved under: the declared one, else the server's
 * `Content-Disposition` one, else the URL's last path segment.
 */
export function downloadFilename(
  target: ConfirmDialogDownloadTarget,
  disposition: string | null,
): string {
  if (target.filename) return target.filename;
  const served = disposition ? DISPOSITION_NAME.exec(disposition)?.[1] : "";
  if (served) return decodeName(served.trim());
  const path = target.url.split(/[?#]/)[0] ?? "";
  return decodeName(path.split("/").pop() || FALLBACK_FILENAME);
}

function openLink(target: ConfirmDialogLinkTarget): void {
  if (typeof window === "undefined" || !target.url) return;
  if (target.newTab) {
    window.open(target.url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = target.url;
}

async function saveDownload(
  target: ConfirmDialogDownloadTarget,
  fetchRaw: DownloadFetch,
): Promise<void> {
  if (!target.url) return;
  const response = await fetchRaw(target.url, { responseType: "blob" });
  const blob = response._data ?? new Blob([]);
  const objectUrl = URL.createObjectURL(blob);
  try {
    downloadFile(
      objectUrl,
      downloadFilename(target, response.headers.get("content-disposition")),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Runs the target of a confirmation's secondary action, the dialog left
 * open: a link opens, a download is fetched with `fetchRaw` and saved.
 */
export function secondaryTargetRunner(
  fetchRaw: DownloadFetch,
): SecondaryTargetRun {
  return (target: ConfirmDialogSecondaryTarget) =>
    target.type === "download"
      ? saveDownload(target, fetchRaw)
      : openLink(target);
}
