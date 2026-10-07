import {
  type PresignResponse,
  useUploadWithProgress,
} from "#dms-ui/app/composables/form/useUploadWithProgress";
import {
  type FileFieldConstraints,
  matchMimetype,
} from "#dms-ui/app/utils/fileConstraints";
import {
  type ImageResizeBounds,
  resizeImageToBounds,
} from "#dms-ui/app/utils/imageResize";

const PRESIGN_URL = "/api/files/presign";
const METADATA_URL = "/api/files/metadata";

/** Upload options the backend serialized for the avatar image field. */
export interface AvatarFieldOptions {
  uploadToken?: string;
  storage?: string;
  constraints?: FileFieldConstraints;
  resize?: ImageResizeBounds;
}

/** Why a picked file was refused before any upload. */
export type AvatarRejection = "mimetype" | "size";

interface FileMetadataResponse {
  url: string;
}

/** Outcome of an avatar upload: a staged key, or why it was refused. */
export interface AvatarUploadResult {
  key?: string;
  rejection?: AvatarRejection;
}

/**
 * The profile avatar's upload flow, the same one the image form field uses:
 * resize to the field's bounds, presign with the field's upload token, then
 * PUT to storage. The returned key is staged until the profile is saved.
 *
 * @param options Serialized options of the avatar image field
 */
export function useProfileAvatar(options: () => AvatarFieldOptions) {
  const { $authFetch } = useAuthFetch();
  const { uploadWithProgress } = useUploadWithProgress();
  const progress = ref(0);

  const isAccepted = (file: File): boolean => {
    const mimetypes = options().constraints?.allowedMimetypes;
    if (!mimetypes?.length) return file.type.startsWith("image/");
    return mimetypes.some((pattern) => matchMimetype(file.type, pattern));
  };

  const prepare = (file: File): Promise<File> => {
    const bounds = options().resize;
    return bounds ? resizeImageToBounds(file, bounds) : Promise.resolve(file);
  };

  async function upload(file: File): Promise<AvatarUploadResult> {
    if (!isAccepted(file)) return { rejection: "mimetype" };
    const prepared = await prepare(file);
    const maxSize = options().constraints?.maxSize;
    if (maxSize && prepared.size > maxSize) return { rejection: "size" };
    progress.value = 0;
    const presign = await $authFetch<PresignResponse>(PRESIGN_URL, {
      method: "POST",
      body: {
        filename: prepared.name,
        size: prepared.size,
        mimetype: prepared.type,
        uploadToken: options().uploadToken,
      },
    });
    await uploadWithProgress(presign, prepared, (value) => {
      progress.value = value;
    });
    return { key: presign.resourceKey };
  }

  /** @returns A short-lived URL to display a stored avatar */
  async function resolveUrl(key: string): Promise<string | null> {
    try {
      const metadata = await $authFetch<FileMetadataResponse>(METADATA_URL, {
        query: { resourceKey: key, storage: options().storage },
      });
      return metadata.url;
    } catch {
      return null;
    }
  }

  return { progress, upload, resolveUrl };
}
