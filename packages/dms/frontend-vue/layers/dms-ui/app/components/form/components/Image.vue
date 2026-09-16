<script setup lang="ts">
import { FORM_FIELD_LOADING_KEY } from "../../../composables/form/types/field-loading";
import { FORM_CONTENT_LANGUAGE_KEY } from "../../../composables/form/types/content-language";
import type { PresignResponse } from "../../../composables/form/useUploadWithProgress";
import {
  type FileFieldConstraints,
  matchMimetype,
} from "../../../utils/fileConstraints";
import {
  type ImageResizeBounds,
  resizeImageToBounds,
} from "../../../utils/imageResize";

export type ImageConstraints = FileFieldConstraints;

interface ImageProps {
  modelValue?: ImageItemValue | ImageItemValue[] | null;
  multiple?: boolean;
  max?: number;
  constraints?: ImageConstraints;
  path?: string;
  storage?: string;
  uploadToken?: string;
  resize?: ImageResizeBounds;
  disabled?: boolean;
}

type ItemStatus = "uploading" | "done" | "error";

interface GalleryItem {
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
  expiresAt?: number;
}

interface FileMetadataResponse {
  resourceKey: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  expiresAt?: number;
}

const props = defineProps<ImageProps>();
const emit = defineEmits<{
  "update:modelValue": [ImageItemValue | ImageItemValue[] | null];
}>();

const { $authFetch } = useAuthFetch();
const { emitFormChange } = useFormField();
const { t } = useI18n();
const toast = useToast();
const { uploadWithProgress } = useUploadWithProgress();
const setFieldLoading = inject(FORM_FIELD_LOADING_KEY, null);
const contentLanguage = inject(FORM_CONTENT_LANGUAGE_KEY, undefined);

const DEFAULT_ACCEPT = "image/*";
const URL_REFRESH_LEAD_MS = 5000;
const TRANSIENT_RETRY_MS = 1000;

const items = ref<GalleryItem[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);
const dragItemId = ref<string | null>(null);
const dragOverItemId = ref<string | null>(null);
const detailItemId = ref<string | null>(null);
const detailAltDraft = ref("");
const metadataTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingMetadata = new Set<string>();
let isDisposed = false;

const toValueArray = (
  value: ImageItemValue | ImageItemValue[] | null | undefined,
): ImageItemValue[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const createItemFromValue = (value: ImageItemValue): GalleryItem => ({
  id: crypto.randomUUID(),
  key: value.key,
  file: null,
  url: "",
  filename: value.key,
  size: null,
  width: null,
  height: null,
  alt: value.alt ?? "",
  principal: value.principal ?? false,
  status: "done",
  progress: 100,
});

const scheduleItemMetadataRefresh = (item: GalleryItem, delay: number) => {
  if (import.meta.env.SSR) return;
  if (isDisposed || !items.value.some(({ id }) => id === item.id)) return;
  const currentTimer = metadataTimers.get(item.id);
  if (currentTimer) clearTimeout(currentTimer);
  metadataTimers.set(
    item.id,
    setTimeout(() => fetchItemMetadata(item, true), delay),
  );
};

const scheduleItemExpiryRefresh = (item: GalleryItem) => {
  if (item.expiresAt === undefined) return;
  const remaining = Math.max(item.expiresAt - Date.now(), 0);
  const refreshLead = Math.min(URL_REFRESH_LEAD_MS, remaining / 2);
  scheduleItemMetadataRefresh(item, remaining - refreshLead);
};

const fetchItemMetadata = async (item: GalleryItem, force = false) => {
  if (isDisposed) return;
  if (!item.key || (!force && item.url) || pendingMetadata.has(item.id)) return;

  pendingMetadata.add(item.id);
  try {
    const metadata = await $authFetch<FileMetadataResponse>(
      "/api/files/metadata",
      {
        query: { resourceKey: item.key, storage: props.storage },
        headers: contentLanguage
          ? { [CONTENT_LANGUAGE_HEADER]: contentLanguage }
          : undefined,
      },
    );
    if (isDisposed || !items.value.some(({ id }) => id === item.id)) return;
    item.url = metadata.url;
    item.filename = metadata.filename;
    item.size = metadata.size;
    item.expiresAt = metadata.expiresAt;
    item.status = "done";
    scheduleItemExpiryRefresh(item);
  } catch (_error) {
    if (isDisposed || !items.value.some(({ id }) => id === item.id)) return;
    if (
      !item.url ||
      (item.expiresAt !== undefined && item.expiresAt <= Date.now())
    ) {
      item.url = "";
      item.status = "error";
    }
    scheduleItemMetadataRefresh(item, TRANSIENT_RETRY_MS);
  } finally {
    pendingMetadata.delete(item.id);
  }
};

const valueSignature = (values: ImageItemValue[]): string =>
  JSON.stringify(
    values.map((value) => [
      value.key,
      value.alt ?? "",
      value.principal ?? false,
    ]),
  );

const currentSignature = (): string =>
  valueSignature(
    referencedItems.value.map((item) => ({
      key: item.key!,
      alt: item.alt || undefined,
      principal: item.principal || undefined,
    })),
  );

const releaseItem = (item: GalleryItem) => {
  if (item.file && item.url) URL.revokeObjectURL(item.url);
  const timer = metadataTimers.get(item.id);
  if (timer) clearTimeout(timer);
  metadataTimers.delete(item.id);
};

const initializeFromModelValue = () => {
  items.value.forEach(releaseItem);
  const values = toValueArray(props.modelValue);
  items.value = values.map(createItemFromValue);
  items.value.forEach((item) => fetchItemMetadata(item));
};

initializeFromModelValue();

watch(
  () => props.modelValue,
  (value) => {
    if (valueSignature(toValueArray(value)) === currentSignature()) return;
    initializeFromModelValue();
  },
);

const referencedItems = computed(() => items.value.filter((item) => item.key));

const maxCount = computed(() => (props.multiple ? (props.max ?? Infinity) : 1));
const isFull = computed(() => items.value.length >= maxCount.value);

const singleItem = computed(() => items.value[0] ?? null);

const acceptString = computed(
  () => props.constraints?.allowedMimetypes?.join(",") ?? DEFAULT_ACCEPT,
);

const formatsHint = computed(() => {
  const mimetypes = props.constraints?.allowedMimetypes;
  if (!mimetypes?.length || mimetypes.includes(DEFAULT_ACCEPT)) {
    return t("dms.form.image.formats_any");
  }
  return mimetypes
    .map((mimetype) => mimetype.split("/")[1]?.toUpperCase() ?? mimetype)
    .join(", ");
});

const ensurePrincipal = () => {
  if (!props.multiple) return;
  const candidates = referencedItems.value;
  if (!candidates.length) return;
  if (candidates.some((item) => item.principal)) return;
  candidates[0]!.principal = true;
};

const emitValue = () => {
  const values: ImageItemValue[] = referencedItems.value.map((item) => ({
    key: item.key!,
    alt: item.alt || undefined,
    ...(props.multiple && { principal: item.principal || undefined }),
  }));

  if (props.multiple) {
    emit("update:modelValue", values.length ? values : null);
  } else {
    emit("update:modelValue", values[0] ?? null);
  }
  emitFormChange();
};

const isAcceptedFile = (file: File): boolean => {
  if (!file.type.startsWith("image/")) return false;
  const mimetypes = props.constraints?.allowedMimetypes;
  if (!mimetypes?.length) return true;
  return mimetypes.some((pattern) => matchMimetype(file.type, pattern));
};

const isWithinSizeLimit = (file: File): boolean => {
  const maxSize = props.constraints?.maxSize;
  return !maxSize || file.size <= maxSize;
};

/**
 * With a resize bound the size cap applies to the resized output (checked in
 * runUpload), not to the picked file — a large photo shrunk to the bound is
 * exactly the use case.
 */
const isAdmissibleSize = (file: File): boolean =>
  !!props.resize || isWithinSizeLimit(file);

const prepareUploadFile = (file: File): Promise<File> =>
  props.resize
    ? resizeImageToBounds(file, props.resize)
    : Promise.resolve(file);

const runUpload = async (item: GalleryItem) => {
  if (!item.file) return;

  item.status = "uploading";
  item.progress = 0;
  setFieldLoading?.(item.id, true);

  try {
    const uploadFile = await prepareUploadFile(item.file);
    if (!isWithinSizeLimit(uploadFile)) {
      notifyRejected(uploadFile, "size");
      item.status = "error";
      return;
    }
    const presign = await $authFetch<PresignResponse>("/api/files/presign", {
      method: "POST",
      body: {
        filename: uploadFile.name,
        size: uploadFile.size,
        mimetype: uploadFile.type,
        uploadToken: props.uploadToken,
      },
    });

    await uploadWithProgress(presign, uploadFile, (progress) => {
      item.progress = progress;
    });

    item.key = presign.resourceKey;
    item.status = "done";
    item.progress = 100;
    ensurePrincipal();
    emitValue();
  } catch (_error) {
    item.status = "error";
  } finally {
    setFieldLoading?.(item.id, false);
  }
};

const createItemFromFile = (file: File): GalleryItem => ({
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

const notifyRejected = (file: File, reason: "size" | "mimetype") => {
  const maxSize = props.constraints?.maxSize;
  toast.add({
    title: t("dms.form.image.rejected_title"),
    description:
      reason === "size"
        ? t("dms.form.image.rejected_size", {
            name: file.name,
            size: maxSize ? formatFileSize(maxSize) : "",
          })
        : t("dms.form.image.rejected_type", { name: file.name }),
    color: "error",
  });
};

const addFiles = (files: FileList | File[] | null) => {
  if (props.disabled || !files?.length) return;

  const accepted: File[] = [];
  for (const file of Array.from(files)) {
    if (!isAdmissibleSize(file)) {
      notifyRejected(file, "size");
    } else if (!isAcceptedFile(file)) {
      notifyRejected(file, "mimetype");
    } else {
      accepted.push(file);
    }
  }
  if (!accepted.length) return;

  if (!props.multiple) {
    items.value.forEach(releaseItem);
    items.value = [createItemFromFile(accepted[0]!)];
    items.value.forEach(runUpload);
    return;
  }

  const room = Math.max(maxCount.value - items.value.length, 0);
  const admitted = accepted.slice(0, room);
  const dropped = accepted.length - admitted.length;
  if (dropped > 0) {
    toast.add({
      title: t("dms.form.image.rejected_title"),
      description: t("dms.form.image.rejected_max", { count: dropped }),
      color: "error",
    });
  }

  const newItems = admitted.map(createItemFromFile);
  items.value.push(...newItems);
  newItems.forEach((item) => {
    const tracked = items.value.find((candidate) => candidate.id === item.id);
    if (tracked) runUpload(tracked);
  });
};

const onFileInputChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  addFiles(input.files);
  input.value = "";
};

const openFilePicker = () => {
  if (!props.disabled) fileInput.value?.click();
};

const onDrop = (event: DragEvent) => {
  isDraggingOver.value = false;
  if (dragItemId.value) return;
  addFiles(event.dataTransfer?.files ?? null);
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    Boolean(element?.isContentEditable)
  );
};

const onPaste = (event: ClipboardEvent) => {
  if (isEditableTarget(event.target)) return;
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (files.length) addFiles(files);
};

const retryUpload = (id: string) => {
  const item = items.value.find((candidate) => candidate.id === id);
  if (item?.file) runUpload(item);
};

const removeItem = (id: string) => {
  const item = items.value.find((candidate) => candidate.id === id);
  if (!item) return;

  releaseItem(item);
  items.value = items.value.filter((candidate) => candidate.id !== id);
  if (detailItemId.value === id) detailItemId.value = null;
  ensurePrincipal();
  emitValue();
};

const setPrincipal = (id: string) => {
  items.value.forEach((item) => {
    item.principal = item.id === id;
  });
  emitValue();
};

const onImageLoad = (item: GalleryItem, event: Event) => {
  const image = event.target as HTMLImageElement;
  item.width = image.naturalWidth;
  item.height = image.naturalHeight;
};

const reorderItems = (dragId: string, overId: string) => {
  if (dragId === overId) return;
  const from = items.value.findIndex((item) => item.id === dragId);
  const to = items.value.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0) return;

  const next = [...items.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  items.value = next;
  emitValue();
};

const onTileDragStart = (event: DragEvent, id: string) => {
  if (props.disabled) return;
  dragItemId.value = id;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
};

const onTileDragEnter = (id: string) => {
  if (dragItemId.value) dragOverItemId.value = id;
};

const onTileDragEnd = () => {
  dragItemId.value = null;
  dragOverItemId.value = null;
};

const onTileDrop = (id: string) => {
  if (dragItemId.value) reorderItems(dragItemId.value, id);
  onTileDragEnd();
};

const detailItem = computed(
  () =>
    items.value.find((candidate) => candidate.id === detailItemId.value) ??
    null,
);

const isDetailOpen = computed({
  get: () => detailItem.value !== null,
  set: (open: boolean) => {
    if (!open) detailItemId.value = null;
  },
});

const openDetail = (id: string) => {
  if (props.disabled) return;
  const item = items.value.find((candidate) => candidate.id === id);
  if (item?.status !== "done") return;
  detailAltDraft.value = item.alt;
  detailItemId.value = id;
};

const saveDetail = () => {
  const item = detailItem.value;
  if (item) {
    item.alt = detailAltDraft.value;
    emitValue();
  }
  detailItemId.value = null;
};

const onSingleAltChange = () => {
  emitValue();
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

const itemMeta = (item: GalleryItem): string => {
  const parts: string[] = [];
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  if (item.size !== null) parts.push(formatFileSize(item.size));
  return parts.join(" · ");
};

onBeforeUnmount(() => {
  isDisposed = true;
  items.value.forEach(releaseItem);
  metadataTimers.forEach(clearTimeout);
});
</script>

<template>
  <div @paste="onPaste">
    <input
      ref="fileInput"
      type="file"
      :accept="acceptString"
      :multiple="multiple"
      class="sr-only"
      @change="onFileInputChange"
    />

    <div v-if="multiple" class="flex flex-col gap-3">
      <div
        class="grid gap-3"
        style="grid-template-columns: repeat(auto-fill, minmax(8.25rem, 1fr))"
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="group relative aspect-square cursor-pointer overflow-hidden rounded-xl shadow-sm transition-transform"
          :class="{
            'ring-warning ring-2': item.principal && item.status === 'done',
            'opacity-40': dragItemId === item.id,
            'scale-95': dragOverItemId === item.id && dragItemId !== item.id,
          }"
          :draggable="!disabled"
          @dragstart="onTileDragStart($event, item.id)"
          @dragenter="onTileDragEnter(item.id)"
          @dragover.prevent
          @dragend="onTileDragEnd"
          @drop.prevent="onTileDrop(item.id)"
          @click="openDetail(item.id)"
        >
          <div class="bg-elevated absolute inset-0">
            <img
              v-if="item.url"
              :src="item.url"
              :alt="item.alt"
              class="absolute inset-0 h-full w-full object-cover"
              @load="onImageLoad(item, $event)"
            />
          </div>

          <span
            class="absolute bottom-1.5 left-1.5 z-[2] max-w-[calc(100%-0.75rem)] truncate rounded-md bg-neutral-900/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
          >
            {{ item.filename }}
          </span>

          <span
            v-if="item.principal && item.status === 'done'"
            class="bg-warning absolute top-1.5 left-1.5 z-[3] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
          >
            <UIcon name="i-lucide-star" class="size-3" />
            {{ t("dms.form.image.principal") }}
          </span>

          <div
            v-if="item.status === 'done' && !disabled"
            class="absolute top-1.5 right-1.5 z-[4] flex -translate-y-0.5 gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100"
          >
            <UTooltip
              v-if="!item.principal"
              :text="t('dms.form.image.set_principal')"
            >
              <UButton
                icon="i-lucide-star"
                size="xs"
                color="neutral"
                variant="solid"
                class="hover:text-warning bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white"
                @click.stop="setPrincipal(item.id)"
              />
            </UTooltip>
            <UTooltip :text="t('dms.form.image.edit_alt')">
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                color="neutral"
                variant="solid"
                class="bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-neutral-900"
                @click.stop="openDetail(item.id)"
              />
            </UTooltip>
            <UTooltip :text="t('dms.form.image.delete')">
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="neutral"
                variant="solid"
                class="hover:text-error bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white"
                @click.stop="removeItem(item.id)"
              />
            </UTooltip>
          </div>

          <div
            v-if="item.status === 'uploading'"
            class="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-neutral-900/40 text-white backdrop-blur-[2px]"
          >
            <span class="text-sm font-semibold tabular-nums">
              {{ item.progress }}%
            </span>
            <span class="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
              <span
                class="block h-full rounded-full bg-white transition-[width] duration-200"
                :style="{ width: `${item.progress}%` }"
              />
            </span>
          </div>

          <div
            v-else-if="item.status === 'error'"
            class="bg-error/15 absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 p-2 text-center backdrop-blur-[1px]"
          >
            <span
              class="bg-error rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              {{ t("dms.form.image.upload_failed") }}
            </span>
            <UButton
              v-if="item.file"
              icon="i-lucide-rotate-cw"
              :label="t('dms.form.image.retry')"
              size="xs"
              color="error"
              variant="outline"
              class="bg-white"
              @click.stop="retryUpload(item.id)"
            />
            <UButton
              v-else
              icon="i-lucide-trash-2"
              :label="t('dms.form.image.delete')"
              size="xs"
              color="error"
              variant="outline"
              class="bg-white"
              @click.stop="removeItem(item.id)"
            />
          </div>
        </div>

        <button
          v-if="!isFull && !disabled"
          type="button"
          class="border-default text-dimmed hover:border-primary hover:bg-primary/5 hover:text-primary flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed transition-colors"
          :class="{
            'border-primary bg-primary/5 text-primary border-solid':
              isDraggingOver,
          }"
          @click="openFilePicker"
          @dragover.prevent="isDraggingOver = true"
          @dragleave="isDraggingOver = false"
          @drop.prevent="onDrop"
        >
          <UIcon name="i-lucide-plus" class="size-6" />
          <span class="text-[13px] font-medium">
            {{ t("dms.form.image.add") }}
          </span>
          <span class="text-[11px]">
            {{ t("dms.form.image.drop_hint") }}
          </span>
        </button>
      </div>

      <p class="text-dimmed flex items-center gap-1.5 text-xs">
        <UIcon name="i-lucide-image" class="size-3.5" />
        {{ t("dms.form.image.gallery_hint") }} · {{ formatsHint }}
      </p>
    </div>

    <div v-else>
      <button
        v-if="!singleItem"
        type="button"
        class="border-default text-dimmed hover:border-primary hover:bg-primary/5 hover:text-primary flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed transition-colors"
        :class="{
          'border-primary bg-primary/5 text-primary border-solid':
            isDraggingOver,
        }"
        :disabled="disabled"
        @click="openFilePicker"
        @dragover.prevent="isDraggingOver = true"
        @dragleave="isDraggingOver = false"
        @drop.prevent="onDrop"
      >
        <UIcon name="i-lucide-upload" class="size-6" />
        <span class="text-[13px] font-medium">
          {{ t("dms.form.image.single_prompt") }}
        </span>
        <span class="text-[11px]">
          {{ t("dms.form.image.single_hint") }} · {{ formatsHint }}
        </span>
      </button>

      <div v-else class="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div
          class="group relative aspect-[4/3] w-full flex-none overflow-hidden rounded-xl shadow-sm sm:w-58"
          :class="{ 'ring-primary ring-2': isDraggingOver }"
          @dragover.prevent="isDraggingOver = true"
          @dragleave="isDraggingOver = false"
          @drop.prevent="onDrop"
        >
          <div class="bg-elevated absolute inset-0">
            <img
              v-if="singleItem.url"
              :src="singleItem.url"
              :alt="singleItem.alt"
              class="absolute inset-0 h-full w-full object-cover"
              @load="onImageLoad(singleItem, $event)"
            />
          </div>

          <div
            v-if="singleItem.status === 'done' && !disabled"
            class="absolute top-1.5 right-1.5 z-[4] flex -translate-y-0.5 gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100"
          >
            <UTooltip :text="t('dms.form.image.replace')">
              <UButton
                icon="i-lucide-arrow-left-right"
                size="xs"
                color="neutral"
                variant="solid"
                class="bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-neutral-900"
                @click="openFilePicker"
              />
            </UTooltip>
            <UTooltip :text="t('dms.form.image.delete')">
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="neutral"
                variant="solid"
                class="hover:text-error bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white"
                @click="removeItem(singleItem.id)"
              />
            </UTooltip>
          </div>

          <div
            v-if="singleItem.status === 'uploading'"
            class="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-neutral-900/40 text-white backdrop-blur-[2px]"
          >
            <span class="text-sm font-semibold tabular-nums">
              {{ singleItem.progress }}%
            </span>
            <span class="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
              <span
                class="block h-full rounded-full bg-white transition-[width] duration-200"
                :style="{ width: `${singleItem.progress}%` }"
              />
            </span>
          </div>

          <div
            v-else-if="singleItem.status === 'error'"
            class="bg-error/15 absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 p-2 text-center backdrop-blur-[1px]"
          >
            <span
              class="bg-error rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              {{ t("dms.form.image.upload_failed") }}
            </span>
            <UButton
              v-if="singleItem.file"
              icon="i-lucide-rotate-cw"
              :label="t('dms.form.image.retry')"
              size="xs"
              color="error"
              variant="outline"
              class="bg-white"
              @click="retryUpload(singleItem.id)"
            />
            <UButton
              v-else
              icon="i-lucide-trash-2"
              :label="t('dms.form.image.delete')"
              size="xs"
              color="error"
              variant="outline"
              class="bg-white"
              @click="removeItem(singleItem.id)"
            />
          </div>
        </div>

        <div class="flex min-w-0 flex-1 flex-col">
          <div class="text-default truncate text-sm font-semibold">
            {{ singleItem.filename }}
          </div>
          <div class="text-dimmed mt-0.5 text-xs">
            <template v-if="singleItem.status === 'uploading'">
              {{
                t("dms.form.image.uploading", { progress: singleItem.progress })
              }}
            </template>
            <template v-else-if="singleItem.status === 'error'">
              {{ t("dms.form.image.upload_failed") }}
            </template>
            <template v-else>{{ itemMeta(singleItem) }}</template>
          </div>

          <div class="mt-3">
            <label
              :for="`${singleItem.id}-alt`"
              class="text-muted mb-1.5 block text-xs font-semibold"
            >
              {{ t("dms.form.image.alt_label") }}
            </label>
            <UInput
              :id="`${singleItem.id}-alt`"
              v-model="singleItem.alt"
              :placeholder="t('dms.form.image.alt_placeholder')"
              :disabled="disabled || singleItem.status !== 'done'"
              class="w-full"
              @change="onSingleAltChange"
            />
          </div>

          <div v-if="!disabled" class="mt-auto flex gap-2 pt-4">
            <UButton
              icon="i-lucide-arrow-left-right"
              :label="t('dms.form.image.replace')"
              color="neutral"
              variant="outline"
              size="sm"
              @click="openFilePicker"
            />
            <UButton
              icon="i-lucide-trash-2"
              :label="t('dms.form.image.delete')"
              color="error"
              variant="outline"
              size="sm"
              @click="removeItem(singleItem.id)"
            />
          </div>
        </div>
      </div>
    </div>

    <UModal v-model:open="isDetailOpen" :ui="{ content: 'sm:max-w-sm' }">
      <template #content>
        <div v-if="detailItem" class="flex flex-col">
          <div
            class="bg-elevated relative aspect-[16/10] w-full overflow-hidden"
          >
            <img
              v-if="detailItem.url"
              :src="detailItem.url"
              :alt="detailItem.alt"
              class="absolute inset-0 h-full w-full object-cover"
            />
            <span
              v-if="detailItem.principal"
              class="bg-warning absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
            >
              <UIcon name="i-lucide-star" class="size-3" />
              {{ t("dms.form.image.principal") }}
            </span>
          </div>

          <div class="flex flex-col gap-2 p-4">
            <label
              :for="`${detailItem.id}-alt-detail`"
              class="text-muted text-xs font-semibold"
            >
              {{ t("dms.form.image.alt_label") }}
            </label>
            <UTextarea
              :id="`${detailItem.id}-alt-detail`"
              v-model="detailAltDraft"
              :placeholder="t('dms.form.image.alt_placeholder')"
              :rows="3"
              autofocus
            />

            <div class="mt-2 flex items-center gap-2">
              <UButton
                icon="i-lucide-star"
                :label="
                  detailItem.principal
                    ? t('dms.form.image.principal_current')
                    : t('dms.form.image.set_principal')
                "
                color="warning"
                variant="subtle"
                size="sm"
                :disabled="detailItem.principal"
                @click="setPrincipal(detailItem.id)"
              />
              <UButton
                :label="t('dms.form.image.save')"
                color="primary"
                size="sm"
                class="ml-auto"
                @click="saveDetail"
              />
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
