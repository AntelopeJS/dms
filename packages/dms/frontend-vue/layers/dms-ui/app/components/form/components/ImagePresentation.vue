<script setup lang="ts">
import DmsFieldError from "../../field-error/FieldError.vue";
import { failureLabelKey, itemMeta } from "./imageItems";
import type { ImagePresentationState } from "./imagePresentation";

const props = defineProps<{
  state: ImagePresentationState;
  multiple?: boolean;
  disabled?: boolean;
}>();

const {
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
} = props.state;
</script>

<template>
  <div class="@container" @paste="onPaste">
    <input
      ref="fileInput"
      type="file"
      :accept="acceptString"
      :multiple="multiple"
      class="sr-only"
      tabindex="-1"
      :aria-invalid="rejections.length > 0 || undefined"
      :aria-describedby="rejections.length ? rejectionId : undefined"
      @change="onFileInputChange"
    />

    <div v-if="multiple" class="flex flex-col gap-3">
      <div
        class="grid grid-cols-[repeat(auto-fill,minmax(min(8.25rem,calc(50%-0.375rem)),1fr))] gap-3"
        role="group"
        v-bind="items.length ? ariaAttrs : undefined"
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="group relative aspect-square cursor-pointer overflow-hidden rounded-xl shadow-sm transition-transform"
          :class="{
            'ring-error ring-2': invalid,
            'ring-primary ring-2':
              !invalid && item.principal && item.status === 'done',
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
            class="absolute top-1.5 left-1.5 z-[3] inline-flex items-center gap-1 rounded-full bg-(--dms-accent-fill) px-2 py-0.5 text-[11px] font-semibold text-(--dms-accent-on-fill) shadow-sm"
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
                class="bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm hover:bg-white hover:text-(--ui-color-primary-700)"
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
            v-else-if="failureLabelKey(item)"
            class="bg-error/15 absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 p-2 text-center backdrop-blur-[1px]"
          >
            <span
              class="bg-error rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              {{ item.errorMessage ?? t(failureLabelKey(item)!) }}
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
          class="text-muted hover:text-primary flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-(--dms-bg-field) transition-colors hover:bg-(--dms-accent-tint)"
          :class="dropZoneClass"
          v-bind="ariaAttrs"
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
        {{ t("dms.form.image.gallery_hint", { shortcut: pasteShortcut }) }} ·
        {{ formatsHint }}
      </p>
    </div>

    <div v-else>
      <button
        v-if="!singleItem"
        type="button"
        class="text-muted hover:text-primary flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-(--dms-bg-field) px-4 py-3 text-center transition-colors hover:bg-(--dms-accent-tint)"
        :class="dropZoneClass"
        v-bind="ariaAttrs"
        :disabled="disabled"
        @click="openFilePicker"
        @dragover.prevent="isDraggingOver = true"
        @dragleave="isDraggingOver = false"
        @drop.prevent="onDrop"
      >
        <UIcon name="i-lucide-upload" class="size-6" />
        <span class="text-[13px] font-medium">
          {{ t("dms.form.image.single_prompt", { shortcut: pasteShortcut }) }}
        </span>
        <span class="text-[11px]">
          {{ t("dms.form.image.single_hint") }} · {{ formatsHint }}
        </span>
      </button>
      <div
        v-else
        class="flex flex-col gap-4 @min-[480px]:flex-row @min-[480px]:items-stretch"
      >
        <div
          class="group relative aspect-[4/3] w-full flex-none overflow-hidden rounded-xl shadow-sm @min-[480px]:w-58"
          :class="{
            'ring-primary ring-2': isDraggingOver,
            'ring-error ring-2': !isDraggingOver && invalid,
          }"
          role="group"
          v-bind="ariaAttrs"
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
            v-else-if="failureLabelKey(singleItem)"
            class="bg-error/15 absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 p-2 text-center backdrop-blur-[1px]"
          >
            <span
              class="bg-error rounded-md px-2 py-0.5 text-[11px] font-semibold text-white"
            >
              {{ singleItem.errorMessage ?? t(failureLabelKey(singleItem)!) }}
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
            <template v-else-if="failureLabelKey(singleItem)">
              {{ t(failureLabelKey(singleItem)!) }}
            </template>
            <template v-else>{{ itemMeta(singleItem) }}</template>
          </div>
          <div class="mt-3">
            <label
              :for="singleAltInputId"
              class="text-muted mb-1.5 block text-xs font-semibold"
            >
              {{ t("dms.form.image.alt_label") }}
            </label>
            <UInput
              :id="singleAltInputId"
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
              class="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-(--dms-accent-fill) px-2 py-0.5 text-[11px] font-semibold text-(--dms-accent-on-fill) shadow-sm"
            >
              <UIcon name="i-lucide-star" class="size-3" />
              {{ t("dms.form.image.principal") }}
            </span>
          </div>
          <div class="flex flex-col gap-2 p-4">
            <label
              :for="detailAltInputId"
              class="text-muted text-xs font-semibold"
            >
              {{ t("dms.form.image.alt_label") }}
            </label>
            <UTextarea
              :id="detailAltInputId"
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
                color="primary"
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
    <DmsFieldError
      :id="rejectionId"
      class="mt-2"
      :message="rejections.join(' ')"
    />
  </div>
</template>
