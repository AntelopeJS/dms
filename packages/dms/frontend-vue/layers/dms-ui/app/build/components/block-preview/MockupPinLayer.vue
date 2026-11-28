<script setup lang="ts">
import { computed } from "vue";
import type { PreviewRect } from "../../utils/blockPreviewMessages";
import type { MockupAnnotationStatus } from "../../utils/mockup";
import type { FramePoint } from "../../utils/mockupPins";
import type { MockupPins } from "../../composables/block-preview/useMockupPins";
import MockupPinCard from "./MockupPinCard.vue";

/**
 * The pins drawn over the preview, in the frame's coordinates: each note at
 * its spot, the pin being written, the card of the open one, and the box a
 * drop would land on. Pins and cards keep their true size however much the
 * frame is shrunk. While the Comment tool is armed, the layer takes the
 * click that drops a new pin and shows a comment-bubble cursor, over the
 * preview's iframe too, since the layer is what the pointer is over. The
 * box a drop would land on is the same one for the armed tool and for a pin
 * being dragged. While a past version is previewed, its pins only open their
 * read-only cards: they are not dragged, nothing is dropped. A layer draws
 * the pins of one page, the one its frame shows.
 */
const props = defineProps<{
  pins: MockupPins;
  /** The id of the page the frame shows. */
  page: string;
  /** How much the frame is shrunk on screen. */
  scale: number;
}>();

const { t } = useI18n();

const unscaled = computed(() => 1 / (props.scale || 1));

function box(rect: PreviewRect) {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

/** A pin's bubble, its tip, the bottom left corner, on `point`. */
function pinStyle(point: FramePoint) {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    transform: `scale(${unscaled.value}) translateY(-100%)`,
    transformOrigin: "top left",
  };
}

/** A card, beside the pin on `point`. */
function cardStyle(point: FramePoint) {
  return {
    left: `${point.x}px`,
    top: `${point.y}px`,
    transform: `scale(${unscaled.value}) translate(2.25rem, -2rem)`,
    transformOrigin: "top left",
  };
}

const drawn = computed(() =>
  props.pins.drawn.value.filter((pin) => pin.page === props.page),
);
const openPin = computed(() =>
  drawn.value.find((pin) => pin.note.id === props.pins.openId.value),
);
const target = computed(() => {
  const shown = props.pins.target.value;
  return shown?.page === props.page ? shown : undefined;
});
const draft = computed(() => {
  const shown = props.pins.draft.value;
  return shown?.page === props.page ? shown.point : undefined;
});

function setOpenStatus(status: MockupAnnotationStatus): void {
  const id = openPin.value?.note.id;
  if (id) void props.pins.setStatus(id, status);
}

function setOpenText(text: string): void {
  const id = openPin.value?.note.id;
  if (id) void props.pins.setText(id, text);
}

/** Whether the pin `id` can be dragged: on the current spec, by whoever may move its note. */
function isDraggable(id: string): boolean {
  const pin = drawn.value.find((entry) => entry.note.id === id);
  return (
    !props.pins.isReadOnly.value && !!pin && props.pins.canChange(pin.note)
  );
}

function onPress(id: string, event: PointerEvent): void {
  if (isDraggable(id)) props.pins.press(id, event);
}

function onClick(id: string): void {
  if (!isDraggable(id)) props.pins.toggleCard(id);
}

function clientOf(event: PointerEvent | MouseEvent) {
  return { x: event.clientX, y: event.clientY };
}
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-30" data-dms-mockup-pins>
    <div
      v-if="pins.isPlacing.value && !pins.isReadOnly.value"
      class="dms-pin-cursor pointer-events-auto absolute inset-0"
      data-dms-mockup-pin-capture
      @pointermove="pins.hover(clientOf($event))"
      @pointerleave="pins.hover(undefined)"
      @click="pins.place(clientOf($event))"
    />
    <div
      v-if="target?.kind === 'block'"
      class="outline-primary pointer-events-none absolute rounded-md outline-2 outline-dashed"
      :style="box(target.rect)"
      data-dms-mockup-pin-target="block"
    />
    <div
      v-else-if="target?.kind === 'page'"
      class="outline-primary/60 pointer-events-none absolute inset-0 rounded-md outline-2 outline-dashed"
      data-dms-mockup-pin-target="page"
    />
    <button
      v-for="pin in drawn"
      :key="pin.note.id"
      type="button"
      class="pointer-events-auto absolute flex size-7 touch-none items-center justify-center rounded-full rounded-bl-none border-2 text-xs font-semibold shadow-md select-none"
      :class="[
        pin.note.status === 'open'
          ? 'bg-primary text-inverted border-default'
          : 'bg-elevated text-muted border-default opacity-70',
        isDraggable(pin.note.id)
          ? 'cursor-grab active:cursor-grabbing'
          : 'cursor-pointer',
      ]"
      :style="pinStyle(pin.point)"
      :aria-label="t('dms.mockup.pin_label', { number: pin.number })"
      :aria-expanded="pins.openId.value === pin.note.id"
      :data-dms-mockup-pin="pin.note.id"
      :data-status="pin.note.status"
      @pointerdown="onPress(pin.note.id, $event)"
      @click="onClick(pin.note.id)"
      @keydown.enter.prevent="pins.toggleCard(pin.note.id)"
      @keydown.space.prevent="pins.toggleCard(pin.note.id)"
    >
      <UIcon
        v-if="pin.note.status === 'resolved'"
        name="i-ph-check-bold"
        class="size-3.5"
      />
      <template v-else>{{ pin.number }}</template>
    </button>
    <MockupPinCard
      v-if="openPin"
      :key="openPin.note.id"
      class="pointer-events-auto absolute z-10"
      :style="cardStyle(openPin.point)"
      :note="openPin.note"
      :number="openPin.number"
      :read-only="pins.isReadOnly.value"
      :can-change="pins.canChange(openPin.note)"
      :can-remove-reply="pins.canRemoveReply"
      :unsaved="pins.unsaved"
      @save="setOpenText"
      @status="setOpenStatus"
      @remove="pins.remove(openPin.note.id)"
      @reply="(text) => openPin && pins.reply(openPin.note.id, text)"
      @remove-reply="
        (replyId) => openPin && pins.removeReply(openPin.note.id, replyId)
      "
      @close="pins.toggleCard(openPin.note.id)"
    />
    <template v-if="draft">
      <span
        class="bg-primary border-default pointer-events-none absolute size-7 rounded-full rounded-bl-none border-2 shadow-md"
        :style="pinStyle(draft)"
        data-dms-mockup-pin-draft
      />
      <MockupPinCard
        class="pointer-events-auto absolute z-10"
        :style="cardStyle(draft)"
        @save="pins.saveDraft"
        @close="pins.discardDraft"
      />
    </template>
  </div>
</template>

<style scoped>
.dms-pin-cursor {
  cursor:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath d='M3 29V16A13 13 0 1 1 16 29Z' fill='white' stroke='%231f2937' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M16 10v12M10 16h12' stroke='%231f2937' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")
      3 29,
    crosshair;
}
</style>
