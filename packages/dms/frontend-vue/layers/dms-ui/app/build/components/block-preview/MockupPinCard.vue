<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import type {
  MockupAnnotation,
  MockupAnnotationStatus,
} from "../../utils/mockup";

/**
 * The card of one pin: the note being written for a new pin, or a note left
 * before, whose text is edited in place and which is resolved, reopened or
 * deleted from here. Escape closes it, Ctrl or Cmd with Enter saves. A
 * read-only card, on a pin of a past version, shows the note and its status:
 * open, or resolved and on which version. A note pinned on a named state of
 * a sketch says which.
 *
 * A press anywhere else closes it too, a press in the preview included,
 * which reaches the page as a press on its iframe; a press on its own pin
 * is left to the pin, which opens and closes it, and a press that pans the
 * Overview, with Space held or another button than the main one, keeps it
 * open as the wheel does. A note's card closed any way but Close or Escape
 * keeps what was written in it, unsaved, for the next time it opens. A new
 * pin's card with text in it stays open and shakes instead, since nothing
 * would bring that text back.
 */
const props = defineProps<{
  /** The note the card shows; absent while a new pin is written. */
  note?: MockupAnnotation;
  number?: number;
  /** Shows the note's text and status without a way to change it. */
  readOnly?: boolean;
  /** What each note's card held unsaved when it closed, by note id. */
  unsaved?: Map<string, string>;
}>();
const emit = defineEmits<{
  save: [text: string];
  close: [];
  status: [status: MockupAnnotationStatus];
  remove: [];
}>();

const NOTE_MAX_LENGTH = 2000;
const PRIMARY_BUTTON = 0;
/** What the pointer is over while Space is held in the Overview: a press there pans. */
const PAN_SURFACE = "[data-dms-mockup-overview-pan]";

const { t } = useI18n();
const card = useTemplateRef<HTMLElement>("card");
const text = ref(
  props.note ? (props.unsaved?.get(props.note.id) ?? props.note.text) : "",
);
const isShaking = ref(false);
let isDiscarded = false;

watch(
  () => props.note?.text,
  (saved) => {
    text.value = saved ?? "";
  },
);

const canSave = computed(
  () => text.value.trim() !== "" && text.value.trim() !== props.note?.text,
);

const stateLabel = computed(() => {
  const resolvedOn = props.note?.resolvedVersion;
  if (props.note?.status === "open") return t("dms.mockup.pin_open");
  return resolvedOn === undefined
    ? t("dms.mockup.pin_resolved")
    : t("dms.mockup.pin_resolved_in", { number: resolvedOn });
});

function save(): void {
  if (canSave.value) emit("save", text.value.trim());
}

/** Close or Escape: what was written and not saved is let go. */
function discard(): void {
  isDiscarded = true;
  emit("close");
}

/** Whether a press on `target` is elsewhere: not on the card, nor on its own pin. */
function isElsewhere(target: EventTarget | null): boolean {
  if (
    !(target instanceof Element) ||
    card.value?.contains(target) ||
    target.closest(PAN_SURFACE)
  ) {
    return false;
  }
  const pin = target.closest<HTMLElement>("[data-dms-mockup-pin]");
  return !props.note || pin?.dataset.dmsMockupPin !== props.note.id;
}

function leave(): void {
  if (props.note || text.value.trim() === "") emit("close");
  else isShaking.value = true;
}

useEventListener(
  window,
  "pointerdown",
  (event: PointerEvent) => {
    if (event.button === PRIMARY_BUTTON && isElsewhere(event.target)) leave();
  },
  { capture: true },
);

onBeforeUnmount(() => {
  const { note, unsaved } = props;
  if (!note || !unsaved) return;
  if (isDiscarded || text.value.trim() === note.text) unsaved.delete(note.id);
  else unsaved.set(note.id, text.value);
});
</script>

<template>
  <div
    ref="card"
    class="border-default bg-default w-72 space-y-2 rounded-lg border p-3 shadow-lg"
    :class="{ 'dms-pin-card-shake': isShaking }"
    role="dialog"
    :aria-label="
      note ? t('dms.mockup.pin_label', { number }) : t('dms.mockup.comment')
    "
    :data-dms-mockup-pin-card="note ? note.id : 'draft'"
    :data-shaking="isShaking || undefined"
    @pointerdown.stop
    @animationend="isShaking = false"
    @keydown.esc.stop.prevent="discard"
    @keydown.enter.ctrl.exact.prevent="save"
    @keydown.enter.meta.exact.prevent="save"
  >
    <p
      v-if="note?.state"
      class="text-muted flex items-center gap-1 text-xs"
      :data-dms-mockup-pin-sketch-state="note.state"
    >
      <UIcon name="i-ph-stack" class="size-3.5" />
      {{ t("dms.mockup.pin_sketch_state", { state: note.state }) }}
    </p>
    <template v-if="note && readOnly">
      <p class="text-default text-sm break-words whitespace-pre-wrap">
        {{ note.text }}
      </p>
      <div class="flex items-center gap-2">
        <span
          class="text-muted flex items-center gap-1 text-xs"
          :data-dms-mockup-pin-state="note.status"
        >
          <UIcon
            :name="note.status === 'open' ? 'i-ph-circle' : 'i-ph-check-bold'"
            class="size-3.5"
          />
          {{ stateLabel }}
        </span>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          class="ms-auto"
          data-dms-mockup-pin-close
          @click="discard"
        >
          {{ t("dms.mockup.close") }}
        </UButton>
      </div>
    </template>
    <UTextarea
      v-else
      v-model="text"
      class="w-full"
      :rows="3"
      autofocus
      :maxlength="NOTE_MAX_LENGTH"
      :placeholder="t('dms.mockup.note_placeholder')"
    />
    <div v-if="!readOnly" class="flex items-center gap-1">
      <template v-if="note">
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          :icon="note.status === 'open' ? 'i-ph-check' : 'i-ph-arrow-u-up-left'"
          data-dms-mockup-pin-status
          @click="emit('status', note.status === 'open' ? 'resolved' : 'open')"
        >
          {{
            note.status === "open"
              ? t("dms.mockup.resolve")
              : t("dms.mockup.reopen")
          }}
        </UButton>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-ph-trash"
          :aria-label="t('dms.mockup.delete_note')"
          data-dms-mockup-pin-delete
          @click="emit('remove')"
        />
      </template>
      <div class="ms-auto flex gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          data-dms-mockup-pin-close
          @click="discard"
        >
          {{ note ? t("dms.mockup.close") : t("dms.mockup.cancel") }}
        </UButton>
        <UButton
          size="xs"
          :disabled="!canSave"
          data-dms-mockup-pin-save
          @click="save"
        >
          {{ note ? t("dms.mockup.save") : t("dms.mockup.comment") }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dms-pin-card-shake {
  animation: dms-pin-card-shake 320ms ease-in-out;
}

@media (prefers-reduced-motion: reduce) {
  .dms-pin-card-shake {
    animation: none;
  }
}

@keyframes dms-pin-card-shake {
  20%,
  60% {
    translate: -4px 0;
  }

  40%,
  80% {
    translate: 4px 0;
  }
}
</style>
