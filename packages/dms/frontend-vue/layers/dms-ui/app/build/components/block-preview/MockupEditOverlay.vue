<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import type {
  PreviewFont,
  PreviewRect,
} from "../../utils/blockPreviewMessages";

/** The text being edited in place: where it is drawn, and how. */
interface InlineText {
  rect: PreviewRect;
  font: PreviewFont;
  value: string;
}

/**
 * What edit mode draws over the preview, from the boxes the preview reports:
 * the selected block's outline and toolbar, the drop line of a drag, and the
 * input a double-clicked text is edited in. The frame is sized to its
 * content, so its boxes are this layer's coordinates as they are.
 */
const props = defineProps<{
  selected?: { rect: PreviewRect; label: string };
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  dropLine?: PreviewRect;
  text?: InlineText;
}>();
const emit = defineEmits<{
  moveUp: [];
  moveDown: [];
  duplicate: [];
  remove: [];
  dragStart: [];
  dragEnd: [];
  dragOver: [point: { x: number; y: number }];
  drop: [point: { x: number; y: number }];
  dragLeave: [];
  textCommit: [value: string];
  textCancel: [];
}>();

const TOOLBAR_HEIGHT_PX = 30;

const { t } = useI18n();
const draft = ref("");
const input = useTemplateRef<HTMLInputElement>("input");
let isSettled = false;

watch(
  () => props.text,
  async (text) => {
    draft.value = text?.value ?? "";
    isSettled = false;
    if (!text) return;
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
);

function box(rect: PreviewRect): Record<string, string> {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

const toolbarStyle = computed(() => {
  const rect = props.selected?.rect;
  if (!rect) return {};
  const above = rect.y >= TOOLBAR_HEIGHT_PX;
  return {
    left: `${rect.x}px`,
    top: `${above ? rect.y - TOOLBAR_HEIGHT_PX : rect.y + 2}px`,
  };
});

const textStyle = computed(() => {
  const text = props.text;
  if (!text) return {};
  return {
    ...box(text.rect),
    minWidth: `${Math.max(text.rect.width, 80)}px`,
    fontFamily: text.font.family,
    fontSize: text.font.size,
    fontWeight: text.font.weight,
    lineHeight: text.font.lineHeight,
    letterSpacing: text.font.letterSpacing,
    color: text.font.color,
    textAlign: text.font.align,
  };
});

function pointOf(event: DragEvent): { x: number; y: number } {
  const target = event.currentTarget;
  const origin =
    target instanceof Element
      ? target.getBoundingClientRect()
      : { left: 0, top: 0 };
  return { x: event.clientX - origin.left, y: event.clientY - origin.top };
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  emit("dragOver", pointOf(event));
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  emit("drop", pointOf(event));
}

function onHandleDragStart(event: DragEvent): void {
  event.dataTransfer?.setData("text/plain", props.selected?.label ?? "");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  emit("dragStart");
}

function settle(commit: boolean): void {
  if (isSettled) return;
  isSettled = true;
  if (commit) emit("textCommit", draft.value);
  else emit("textCancel");
}
</script>

<template>
  <div class="pointer-events-none absolute inset-0" data-dms-mockup-overlay>
    <div
      v-if="isDragging"
      class="pointer-events-auto absolute inset-0"
      data-dms-mockup-drop-zone
      @dragover="onDragOver"
      @dragenter.prevent
      @dragleave="emit('dragLeave')"
      @drop="onDrop"
    />
    <div
      v-if="dropLine && isDragging"
      class="bg-primary pointer-events-none absolute rounded-full"
      :style="box(dropLine)"
      data-dms-mockup-drop-line
    />
    <template v-if="selected && !isDragging">
      <div
        class="outline-primary pointer-events-none absolute rounded-md outline-2"
        :style="box(selected.rect)"
        data-dms-mockup-selection
      />
      <div
        class="border-primary/50 bg-default text-default pointer-events-auto absolute z-10 flex h-7 items-center gap-0.5 rounded-md border px-1 shadow-sm"
        :style="toolbarStyle"
        role="toolbar"
        :aria-label="t('dms.mockup.toolbar')"
        data-dms-mockup-toolbar
      >
        <span class="text-primary max-w-40 truncate px-1 font-mono text-[11px]">
          {{ selected.label }}
        </span>
        <span
          class="text-muted hover:text-highlighted flex size-6 cursor-grab items-center justify-center"
          draggable="true"
          role="button"
          tabindex="-1"
          :aria-label="t('dms.mockup.drag')"
          data-dms-mockup-drag-handle
          @dragstart="onHandleDragStart"
          @dragend="emit('dragEnd')"
        >
          <UIcon name="i-ph-dots-six-vertical" class="size-4" />
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-up"
          :disabled="!canMoveUp"
          :aria-label="t('dms.mockup.move_up')"
          data-dms-mockup-move-up
          @click="emit('moveUp')"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-arrow-down"
          :disabled="!canMoveDown"
          :aria-label="t('dms.mockup.move_down')"
          data-dms-mockup-move-down
          @click="emit('moveDown')"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-ph-copy"
          :aria-label="t('dms.mockup.duplicate')"
          data-dms-mockup-duplicate
          @click="emit('duplicate')"
        />
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-ph-trash"
          :aria-label="t('dms.mockup.remove')"
          data-dms-mockup-remove
          @click="emit('remove')"
        />
      </div>
    </template>
    <input
      v-if="text"
      ref="input"
      v-model="draft"
      class="outline-primary bg-default pointer-events-auto absolute z-20 rounded-sm px-0.5 outline-2"
      :style="textStyle"
      :aria-label="t('dms.mockup.inline_text')"
      data-dms-mockup-inline-text
      @keydown.enter.prevent="settle(true)"
      @keydown.esc.prevent="settle(false)"
      @blur="settle(true)"
    />
  </div>
</template>
