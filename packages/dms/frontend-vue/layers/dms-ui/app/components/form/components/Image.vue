<script setup lang="ts">
import { fieldErrorId } from "#dms-core/app/composables/useFieldErrors";
import { FORM_FIELD_LOADING_KEY } from "../../../composables/form/types/field-loading";
import type { PresignResponse } from "../../../composables/form/useUploadWithProgress";
import { useKeyboardPlatform } from "../../../composables/global/keyboardPlatform";
import {
  type FileFieldConstraints,
  matchMimetype,
} from "../../../utils/fileConstraints";
import {
  type ImageResizeBounds,
  resizeImageToBounds,
} from "../../../utils/imageResize";
import { useFileMetadata } from "../../../build/composables/files/useFileMetadata";
import {
  type GalleryItem,
  createItemFromFile,
  formatFileSize,
  releaseItem,
  storedImageItems,
  toValueArray,
  valueSignature,
} from "./imageItems";
import ImagePresentation from "./ImagePresentation.vue";
import type { ImagePresentationState } from "./imagePresentation";

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

const props = defineProps<ImageProps>();
const emit = defineEmits<{
  "update:modelValue": [ImageItemValue | ImageItemValue[] | null];
}>();

const { $authFetch } = useAuthFetch();

const { emitFormChange, color: fieldColor, ariaAttrs } = useFormField();
const hasFieldError = computed(() => fieldColor.value === "error");
const { t } = useI18n();
const { formatShortcut } = useKeyboardPlatform();
/** The paste key the hints mention: "⌘V" on macOS, "Ctrl V" elsewhere. */
const pasteShortcut = computed(() => formatShortcut(["meta", "v"]));
const { uploadWithProgress } = useUploadWithProgress();
const setFieldLoading = inject(FORM_FIELD_LOADING_KEY, null);

const files = useFileMetadata(props.storage);

const DEFAULT_ACCEPT = "image/*";

/** DOM ids derive from useId so server rendering and hydration agree. */
const fieldId = useId();
const singleAltInputId = `${fieldId}-alt`;
const detailAltInputId = `${fieldId}-alt-detail`;

const items = ref<GalleryItem[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const isDraggingOver = ref(false);

const dropZoneClass = computed(() => {
  if (isDraggingOver.value) {
    return "border-primary text-primary border-solid bg-(--dms-accent-tint) shadow-[0_0_0_6px_var(--dms-accent-tint)]";
  }
  return invalid.value
    ? "border-error hover:border-error"
    : "border-(--dms-border-top) hover:border-primary";
});
const dragItemId = ref<string | null>(null);
const dragOverItemId = ref<string | null>(null);
const detailItemId = ref<string | null>(null);
const detailAltDraft = ref("");

const createItemFromValue = storedImageItems(files);

const currentSignature = (): string =>
  valueSignature(
    referencedItems.value.map((item) => ({
      key: item.key!,
      alt: item.alt || undefined,
      principal: item.principal || undefined,
    })),
  );

const initializeFromModelValue = () => {
  items.value.forEach(releaseItem);
  const values = toValueArray(props.modelValue);
  items.value = values.map(createItemFromValue);
  values.forEach((value) => void files.resolve(value.key));
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

/** With resize bounds, the cap applies to the output rather than the picked file. */
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

const rejections = ref<string[]>([]);
const rejectionId = fieldErrorId(`${fieldId}-rejection`);

const invalid = computed(
  () => hasFieldError.value || rejections.value.length > 0,
);

watch(hasFieldError, (isInvalid) => {
  if (isInvalid) rejections.value = [];
});

const notifyRejected = (file: File, reason: "size" | "mimetype") => {
  const maxSize = props.constraints?.maxSize;
  rejections.value.push(
    reason === "size"
      ? t("dms.form.image.rejected_size", {
          name: file.name,
          size: maxSize ? formatFileSize(maxSize) : "",
        })
      : t("dms.form.image.rejected_type", { name: file.name }),
  );
};

const addFiles = (files: FileList | File[] | null) => {
  if (props.disabled || !files?.length) return;
  rejections.value = [];

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
    rejections.value.push(t("dms.form.image.rejected_max", { count: dropped }));
  }

  const newItems = admitted.map(createItemFromFile);
  items.value.push(...newItems);
  newItems.forEach((item) => {
    const tracked = items.value.find((candidate) => candidate.id === item.id);
    if (tracked) runUpload(tracked);
  });
};

const onFileInputChange = (event: Event) => {
  // SAFETY: the template binds this handler to the file input's change event.
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- EventTarget does not establish an HTMLElement. This legacy projection preserves optional property reads on null and non-element targets without validating them.
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
  // SAFETY: both template bindings attach this handler to an img load event.
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

onBeforeUnmount(() => {
  items.value.forEach(releaseItem);
});

const presentation = {
  t,
  ariaAttrs,
  fileInput,
  items,
  singleItem,
  detailItem,
  isDraggingOver,
  dragItemId,
  dragOverItemId,
  detailAltDraft,
  isDetailOpen,
  invalid,
  isFull,
  acceptString,
  formatsHint,
  pasteShortcut,
  dropZoneClass,
  rejections,
  rejectionId,
  singleAltInputId,
  detailAltInputId,
  onFileInputChange,
  onDrop,
  onPaste,
  onImageLoad,
  openFilePicker,
  openDetail,
  saveDetail,
  onSingleAltChange,
  setPrincipal,
  removeItem,
  retryUpload,
  onTileDragStart,
  onTileDragEnter,
  onTileDragEnd,
  onTileDrop,
} satisfies ImagePresentationState;
</script>

<template>
  <ImagePresentation
    :state="presentation"
    :multiple="multiple"
    :disabled="disabled"
  />
</template>
