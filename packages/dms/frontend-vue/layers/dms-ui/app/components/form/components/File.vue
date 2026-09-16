<script setup lang="ts">
import { FORM_FIELD_LOADING_KEY } from "../../../composables/form/types/field-loading";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../../composables/form/types/content-language";
import type { PresignResponse } from "../../../composables/form/useUploadWithProgress";
import {
  checkFileConstraints,
  type FileConstraintViolation,
  type FileFieldConstraints,
} from "../../../utils/fileConstraints";

export type FileConstraints = FileFieldConstraints;

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  error?: string;
}

interface FileMetadataResponse {
  resourceKey: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  expiresAt?: number;
}

interface FileProps {
  modelValue?: string | string[] | null;
  multiple?: boolean;
  constraints?: FileConstraints;
  path?: string;
  storage?: string;
  uploadToken?: string;
  disabled?: boolean;
}

const props = defineProps<FileProps>();
const emit = defineEmits<{
  "update:modelValue": [string | string[] | null];
}>();

const { $authFetch } = useAuthFetch();
const { t } = useI18n();
const toast = useToast();

const { emitFormChange } = useFormField();

const { uploadWithProgress } = useUploadWithProgress();

const selectedFiles = ref<File | File[] | null>(null);
const uploadingFiles = ref<UploadingFile[]>([]);
const uploadedKeys = ref<string[]>([]);
const fileMetadata = ref<Map<string, FileMetadataResponse>>(new Map());
const metadataTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingMetadata = new Map<string, Promise<void>>();
let isDisposed = false;
const contentLanguage = inject(FORM_CONTENT_LANGUAGE_KEY, undefined);
const URL_REFRESH_LEAD_MS = 5000;
const TRANSIENT_RETRY_MS = 1000;

const initializeFromModelValue = (
  val: string | string[] | null | undefined,
) => {
  if (!val) {
    uploadedKeys.value = [];
  } else if (typeof val === "string") {
    uploadedKeys.value = val ? [val] : [];
  } else {
    uploadedKeys.value = val;
  }
};

initializeFromModelValue(props.modelValue);

const scheduleMetadataRefresh = (resourceKey: string, expiresAt?: number) => {
  if (import.meta.env.SSR) return;
  if (isDisposed || !uploadedKeys.value.includes(resourceKey)) return;
  const currentTimer = metadataTimers.get(resourceKey);
  if (currentTimer) clearTimeout(currentTimer);
  if (expiresAt === undefined) return;
  const remaining = Math.max(expiresAt - Date.now(), 0);
  const refreshLead = Math.min(URL_REFRESH_LEAD_MS, remaining / 2);
  metadataTimers.set(
    resourceKey,
    setTimeout(() => fetchMetadata(resourceKey, true), remaining - refreshLead),
  );
};

const fetchMetadata = async (
  resourceKey: string,
  force = false,
): Promise<void> => {
  if (isDisposed) return;
  const pending = pendingMetadata.get(resourceKey);
  if (pending) {
    await pending;
    if (force) await fetchMetadata(resourceKey, true);
    return;
  }
  if (!force && fileMetadata.value.has(resourceKey)) return;

  const request = requestMetadata(resourceKey);
  pendingMetadata.set(resourceKey, request);
  await request;
};

const requestMetadata = async (resourceKey: string): Promise<void> => {
  try {
    const metadata = await $authFetch<FileMetadataResponse>(
      `/api/files/metadata`,
      {
        query: {
          resourceKey,
          storage: props.storage,
        },
        headers: contentLanguage
          ? { [CONTENT_LANGUAGE_HEADER]: contentLanguage }
          : undefined,
      },
    );
    if (isDisposed || !uploadedKeys.value.includes(resourceKey)) return;
    fileMetadata.value.set(resourceKey, metadata);
    scheduleMetadataRefresh(resourceKey, metadata.expiresAt);
  } catch (_error) {
    if (isDisposed || !uploadedKeys.value.includes(resourceKey)) return;
    const cached = fileMetadata.value.get(resourceKey);
    const isExpired =
      cached?.expiresAt !== undefined && cached.expiresAt <= Date.now();
    if (!cached || isExpired) {
      fileMetadata.value.set(resourceKey, {
        resourceKey,
        filename: cached?.filename ?? resourceKey,
        size: cached?.size ?? 0,
        mimetype: cached?.mimetype ?? "application/octet-stream",
        url: "",
      });
    }
    if (!import.meta.env.SSR) {
      metadataTimers.set(
        resourceKey,
        setTimeout(() => fetchMetadata(resourceKey, true), TRANSIENT_RETRY_MS),
      );
    }
  } finally {
    pendingMetadata.delete(resourceKey);
  }
};

const openFile = async (resourceKey: string) => {
  await fetchMetadata(resourceKey, true);
  const url = fileMetadata.value.get(resourceKey)?.url;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
};

const fetchAllMetadata = async (keys: string[]) => {
  await Promise.all(keys.map((key) => fetchMetadata(key)));
};

watch(
  () => props.modelValue,
  (val) => {
    const newKeys = !val ? [] : typeof val === "string" ? [val] : val;
    if (newKeys.join(",") !== uploadedKeys.value.join(",")) {
      uploadedKeys.value = newKeys;
      fetchAllMetadata(newKeys);
    }
  },
);

watch(
  uploadedKeys,
  (keys) => {
    fetchAllMetadata(keys);
  },
  { immediate: true },
);

const emitValue = () => {
  if (props.multiple) {
    emit(
      "update:modelValue",
      uploadedKeys.value.length ? uploadedKeys.value : null,
    );
  } else {
    emit("update:modelValue", uploadedKeys.value[0] ?? null);
  }
  emitFormChange();
};

const uploadFile = async (
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> => {
  const presign = await $authFetch<PresignResponse>("/api/files/presign", {
    method: "POST",
    body: {
      filename: file.name,
      size: file.size,
      mimetype: file.type,
      uploadToken: props.uploadToken,
    },
  });

  await uploadWithProgress(presign, file, onProgress);

  return presign.resourceKey;
};

const processFile = async (file: File) => {
  const uploadId = crypto.randomUUID();

  uploadingFiles.value.push({
    id: uploadId,
    file,
    progress: 0,
  });

  setFieldLoading?.(uploadId, true);

  try {
    const resourceKey = await uploadFile(file, (progress) => {
      const uploadingFile = uploadingFiles.value.find((u) => u.id === uploadId);
      if (uploadingFile) uploadingFile.progress = progress;
    });

    uploadingFiles.value = uploadingFiles.value.filter(
      (u) => u.id !== uploadId,
    );

    if (props.multiple) {
      uploadedKeys.value.push(resourceKey);
    } else {
      uploadedKeys.value = [resourceKey];
    }

    emitValue();
  } catch (_error) {
    const uploadingFile = uploadingFiles.value.find((u) => u.id === uploadId);
    if (uploadingFile) {
      uploadingFile.error = "Upload failed";
    }
  } finally {
    setFieldLoading?.(uploadId, false);
  }
};

const notifyRejected = (file: File, violation: FileConstraintViolation) => {
  toast.add({
    title: t("dms.form.file.rejected_title"),
    description:
      violation === "size"
        ? t("dms.form.file.rejected_size", {
            name: file.name,
            size: maxSizeFormatted.value ?? "",
          })
        : t("dms.form.file.rejected_type", { name: file.name }),
    color: "error",
  });
};

watch(selectedFiles, async (value) => {
  if (!value) return;

  const files = Array.isArray(value) ? value : [value];

  for (const file of files) {
    const violation = checkFileConstraints(file, props.constraints);
    if (violation) {
      notifyRejected(file, violation);
      continue;
    }
    await processFile(file);
  }

  selectedFiles.value = null;
});

const removeUploadingFile = (id: string) => {
  uploadingFiles.value = uploadingFiles.value.filter((u) => u.id !== id);
};

const removeUploadedFile = (key: string) => {
  uploadedKeys.value = uploadedKeys.value.filter((k) => k !== key);
  fileMetadata.value.delete(key);
  const timer = metadataTimers.get(key);
  if (timer) clearTimeout(timer);
  emitValue();
};

const getMetadata = (key: string): FileMetadataResponse | undefined => {
  return fileMetadata.value.get(key);
};

const isImage = (mimetype: string): boolean => {
  return mimetype.startsWith("image/");
};

const BYTES_PER_UNIT = 1024;

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= BYTES_PER_UNIT && unitIndex < units.length - 1) {
    size /= BYTES_PER_UNIT;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const acceptString = computed(() =>
  props.constraints?.allowedMimetypes?.join(","),
);

const maxSizeFormatted = computed(() => {
  if (!props.constraints?.maxSize) return null;
  return formatFileSize(props.constraints.maxSize);
});

const isUploading = computed(() => uploadingFiles.value.length > 0);

const setFieldLoading = inject(FORM_FIELD_LOADING_KEY, null);

onScopeDispose(() => {
  isDisposed = true;
  metadataTimers.forEach(clearTimeout);
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <UFileUpload
      v-model="selectedFiles"
      :multiple="multiple"
      :accept="acceptString"
      :disabled="disabled || isUploading"
    >
      <template v-if="maxSizeFormatted" #description>
        <span class="text-muted text-sm">
          {{ $t("dms.form.file.max_size", { size: maxSizeFormatted }) }}
        </span>
      </template>
    </UFileUpload>

    <div v-if="uploadingFiles.length" class="flex flex-col gap-1">
      <div
        v-for="item in uploadingFiles"
        :key="item.id"
        class="bg-elevated flex flex-col gap-1.5 rounded-md p-2"
      >
        <div class="flex items-center gap-2">
          <UIcon
            v-if="item.error"
            name="i-lucide-alert-circle"
            class="text-error h-4 w-4"
          />
          <UIcon v-else name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
          <span class="flex-1 truncate text-sm">{{ item.file.name }}</span>
          <span v-if="!item.error" class="text-muted text-xs tabular-nums">
            {{ item.progress }}%
          </span>
          <span class="text-muted text-xs">
            {{ formatFileSize(item.file.size) }}
          </span>
          <UButton
            v-if="item.error"
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            @click="removeUploadingFile(item.id)"
          />
        </div>
        <span
          v-if="!item.error"
          class="bg-accented h-1 w-full overflow-hidden rounded-full"
        >
          <span
            class="bg-primary block h-full rounded-full transition-[width] duration-200"
            :style="{ width: `${item.progress}%` }"
          />
        </span>
      </div>
    </div>

    <div v-if="uploadedKeys.length" class="flex flex-col gap-1">
      <div
        v-for="key in uploadedKeys"
        :key="key"
        class="bg-elevated flex items-center gap-2 rounded-md p-2"
      >
        <template v-if="getMetadata(key)">
          <img
            v-if="isImage(getMetadata(key)!.mimetype) && getMetadata(key)!.url"
            :src="getMetadata(key)!.url"
            :alt="getMetadata(key)!.filename"
            class="h-8 w-8 rounded object-cover"
          />
          <UIcon
            v-else
            name="i-lucide-file-check"
            class="text-success h-4 w-4"
          />
          <ULink
            :to="getMetadata(key)!.url"
            target="_blank"
            class="decoration-dimmed/40 hover:decoration-muted flex-1 truncate text-sm underline"
            @click.prevent="openFile(key)"
          >
            {{ getMetadata(key)!.filename }}
          </ULink>
          <span class="text-muted text-xs">
            {{ formatFileSize(getMetadata(key)!.size) }}
          </span>
        </template>
        <template v-else>
          <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
          <span class="flex-1 truncate text-sm">{{ key }}</span>
        </template>
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          size="xs"
          :disabled="disabled"
          @click="removeUploadedFile(key)"
        />
      </div>
    </div>
  </div>
</template>
