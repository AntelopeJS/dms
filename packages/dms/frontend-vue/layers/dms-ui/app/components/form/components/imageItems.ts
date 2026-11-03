import type { useFileMetadata } from "../../../build/composables/files/useFileMetadata";

/** `error` is a failed upload; `unavailable` is an unreadable stored value. */
export type ItemStatus = "uploading" | "done" | "error" | "unavailable";

export interface GalleryItem {
  id: string;
  key: string | null;
  file: File | null;
  url: string;
  filename: string;
  size: number | null;
  width: number | null;
  height: number | null;
  alt: string;
  principal: boolean;
  status: ItemStatus;
  progress: number;
  errorMessage?: string;
}

const FAILURE_LABEL_KEYS: Partial<Record<ItemStatus, string>> = {
  error: "dms.form.image.upload_failed",
  unavailable: "dms.form.image.file_unavailable",
};

export const toValueArray = (
  value: ImageItemValue | ImageItemValue[] | null | undefined,
): ImageItemValue[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

/** Stored display properties stay live against shared file metadata. */
export const storedImageItems = (files: ReturnType<typeof useFileMetadata>) => {
  // SAFETY: the descriptors complete the GalleryItem with live metadata getters.
  const createItemFromValue = (value: ImageItemValue): GalleryItem =>
    Object.defineProperties(
      {
        id: crypto.randomUUID(),
        key: value.key,
        file: null,
        width: null,
        height: null,
        alt: value.alt ?? "",
        principal: value.principal ?? false,
        progress: 100,
      },
      {
        url: {
          get: () => files.metadata(value.key)?.url ?? "",
          enumerable: true,
        },
        filename: {
          get: () => files.lastRead(value.key)?.filename ?? value.key,
          enumerable: true,
        },
        size: {
          get: () => files.lastRead(value.key)?.size ?? null,
          enumerable: true,
        },
        status: {
          get: (): ItemStatus =>
            files.isUnavailable(value.key) ? "unavailable" : "done",
          enumerable: true,
        },
      },
    ) as GalleryItem;
  return createItemFromValue;
};

export const valueSignature = (values: ImageItemValue[]): string =>
  JSON.stringify(
    values.map((value) => [
      value.key,
      value.alt ?? "",
      value.principal ?? false,
    ]),
  );

export const releaseItem = (item: GalleryItem) => {
  if (item.file && item.url) URL.revokeObjectURL(item.url);
};

export const createItemFromFile = (file: File): GalleryItem => ({
  id: crypto.randomUUID(),
  key: null,
  file,
  url: URL.createObjectURL(file),
  filename: file.name,
  size: file.size,
  width: null,
  height: null,
  alt: "",
  principal: false,
  status: "uploading",
  progress: 0,
});

const BYTES_PER_UNIT = 1024;

export const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= BYTES_PER_UNIT && unitIndex < units.length - 1) {
    size /= BYTES_PER_UNIT;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export const failureLabelKey = (item: GalleryItem): string | undefined =>
  FAILURE_LABEL_KEYS[item.status];

export const itemMeta = (item: GalleryItem): string => {
  const parts: string[] = [];
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  if (item.size !== null) parts.push(formatFileSize(item.size));
  return parts.join(" · ");
};
