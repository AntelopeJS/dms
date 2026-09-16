export interface PresignResponse {
  uploadUrl: string;
  resourceKey: string;
  headers: Record<string, string>;
}

const UPLOAD_SUCCESS_MIN = 200;
const UPLOAD_SUCCESS_MAX = 300;

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
      Object.entries(presign.headers ?? {}).forEach(([name, value]) =>
        xhr.setRequestHeader(name, value),
      );
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
