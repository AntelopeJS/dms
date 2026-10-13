import { downloadFile } from "#dms-core/app/utils/downloadFile";

/** A file to fetch with the user's session, and the name it is saved under. */
export interface FileDownload {
  url: string;
  /** Saved under; the response's `Content-Disposition` name, else the URL's. */
  filename?: string;
}

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
  download: FileDownload,
  disposition: string | null,
): string {
  if (download.filename) return download.filename;
  const served = disposition ? DISPOSITION_NAME.exec(disposition)?.[1] : "";
  if (served) return decodeName(served.trim());
  const path = download.url.split(/[?#]/)[0] ?? "";
  return decodeName(path.split("/").pop() || FALLBACK_FILENAME);
}

/**
 * Fetches a file with `fetchRaw` (the user's session) and saves it; rejects
 * when the request fails.
 */
export async function saveDownload(
  download: FileDownload,
  fetchRaw: DownloadFetch,
): Promise<void> {
  if (!download.url) return;
  const response = await fetchRaw(download.url, { responseType: "blob" });
  const blob = response._data ?? new Blob([]);
  const objectUrl = URL.createObjectURL(blob);
  try {
    downloadFile(
      objectUrl,
      downloadFilename(download, response.headers.get("content-disposition")),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
