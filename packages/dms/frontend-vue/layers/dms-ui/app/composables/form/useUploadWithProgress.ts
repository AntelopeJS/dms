export interface PresignResponse {
  uploadUrl: string;
  resourceKey: string;
  headers: Record<string, string>;
}

const UPLOAD_SUCCESS_MIN = 200;
const UPLOAD_SUCCESS_MAX = 300;

/**
 * Request headers a browser refuses to let script set (Fetch standard,
 * "forbidden request-header"). A presign may still list them -- the storage
 * signs `Content-Length` -- and the browser sends them itself, so copying them
 * only logs `Refused to set unsafe header` on every upload.
 */
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);
const FORBIDDEN_REQUEST_HEADER_PREFIXES = ["proxy-", "sec-"];

const isForbiddenRequestHeader = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  return (
    FORBIDDEN_REQUEST_HEADERS.has(normalized) ||
    FORBIDDEN_REQUEST_HEADER_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix),
    )
  );
};

/**
 * Uploads a file to the presigned storage URL with a PUT request, reporting
 * real upload progress and rejecting on a non-2xx response (a plain `fetch`
 * exposes neither). Shared by the file and image form fields.
 */
export function useUploadWithProgress() {
  const uploadWithProgress = (
    presign: PresignResponse,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presign.uploadUrl);
      Object.entries(presign.headers ?? {})
        .filter(([name]) => !isForbiddenRequestHeader(name))
        .forEach(([name, value]) => xhr.setRequestHeader(name, value));
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= UPLOAD_SUCCESS_MIN && xhr.status < UPLOAD_SUCCESS_MAX
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });

  return { uploadWithProgress };
}
