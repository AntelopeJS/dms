<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import DmsSegmented from "../segmented/Segmented.vue";
import { usePageLive } from "../../composables/live/usePageLive";
import { useUpdatedLabel } from "../../build/composables/live/useUpdatedLabel";
import { useLiveToggleShortcut } from "../../build/composables/live/useLiveToggleShortcut";
import { HIDDEN_TAB_NOTE } from "../../build/composables/live/pageLiveController";
import type { ConfirmTranslate } from "../../build/composables/confirm/confirmDialogTexts";
import {
  missedRowsText,
  showLiveNote,
} from "../../build/composables/live/liveNotes";
import {
  type PageToolbarSize,
  usePageToolbar,
  useToolbarLiveToggle,
} from "../../build/composables/page-toolbar/pageToolbarContext";
import { PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES } from "../../build/composables/page-toolbar/toolbarControlHeight";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// Its ids are optional: it reads the page's live state, not its own, and a
// component may draw it by hand inside its own `PageToolbar`.
interface LiveToggleBlockProps extends Partial<DefaultComponentProps> {
  align?: "left" | "center" | "right";
  /** Shows "updated N s ago". */
  showUpdatedAt?: boolean;
  /** `segmented` (Live / Pause segments) or `pill` (a pulsing Live pill). */
  variant?: "segmented" | "pill";
  /** How large it is drawn; the holding `PageToolbar`'s size, else `sm`. */
  size?: PageToolbarSize;
  /** What the paused toggle calls the missed events, given `{count}`. */
  missedLabel?: string;
}

const props = withDefaults(defineProps<LiveToggleBlockProps>(), {
  align: "right",
  showUpdatedAt: true,
  variant: "segmented",
  size: undefined,
  missedLabel: undefined,
});

const DIRECT = "direct";
const PAUSE = "pause";
const DEFAULT_SIZE: PageToolbarSize = "sm";
const ALIGN_CLASSES: Record<
  NonNullable<LiveToggleBlockProps["align"]>,
  string
> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const PILL_BUTTON_CLASS =
  "focus-visible:outline-primary flex h-full items-center rounded-[5px] font-medium transition-colors focus-visible:outline-2";
const PILL_IDLE_CLASS = "text-muted hover:text-default hover:bg-elevated";

/** What each size changes: the texts and the pill's buttons. */
interface LiveToggleSizeClasses {
  text: string;
  pillButton: string;
}

// The pill takes the toolbar's one height (its buttons fill it), as the
// period selector's segments beside it and the Resume button do.
const SIZE_CLASSES: Record<PageToolbarSize, LiveToggleSizeClasses> = {
  xs: {
    text: "text-[11.5px]",
    pillButton: "gap-1 px-1.5 text-[11px]",
  },
  sm: {
    text: "text-[12.5px]",
    pillButton: "gap-1.5 px-2 text-[12px]",
  },
  md: {
    text: "text-[13px]",
    pillButton: "gap-1.5 px-2.5 text-[13px]",
  },
};

const { t } = useI18n();
const translate = t as ConfirmTranslate;
const live = usePageLive();
const toolbar = usePageToolbar();
useToolbarLiveToggle(toolbar);
const size = computed(() => props.size ?? toolbar?.size.value ?? DEFAULT_SIZE);
const sizeClasses = computed(() => SIZE_CLASSES[size.value]);
const heightClass = computed(
  () => PAGE_TOOLBAR_CONTROL_HEIGHT_CLASSES[size.value],
);

// The state lives in the browser (its storage, its clock): the server and the
// hydrating render draw nothing, the mounted block draws the real state.
const isMounted = ref(false);
onMounted(() => (isMounted.value = true));
const updatedText = useUpdatedLabel(
  () => live.lastUpdatedAt.value,
  props.showUpdatedAt,
);

const mode = computed({
  get: () => (live.isPaused.value ? PAUSE : DIRECT),
  set: (next: string | number) => {
    if (next === PAUSE) live.pause();
    else live.resume();
  },
});

const items = computed(() => [
  { value: DIRECT, label: t("dms.live.direct"), icon: "i-ph-broadcast" },
  { value: PAUSE, label: t("dms.live.pause"), icon: "i-ph-pause" },
]);

const updatedLabel = computed(() => {
  const updated = updatedText.value;
  if (!updated) return "";
  return live.isPolling.value
    ? `${updated} · ${t("dms.live.polling")}`
    : updated;
});

const missedText = computed(() => {
  const count = live.missedCount.value;
  if (count === 0) return "";
  return missedRowsText(count, props.missedLabel, translate);
});

// "Paused · typing in the Tester · 40 new requests", the detail apart: it
// takes its own tone.
const pausedText = computed(() => {
  const reason = live.pauseReason.value;
  return [
    t("dms.live.paused"),
    reason ? showLiveNote(reason, translate).text : "",
    missedText.value,
  ]
    .filter((part) => part !== "")
    .join(" · ");
});

const detail = computed(() => {
  const note = live.missedDetail.value;
  if (!note || live.missedCount.value === 0) return null;
  return showLiveNote(note, translate);
});

// A hidden tab resumes by itself when it shows again: no button for it.
const canResume = computed(
  () =>
    live.isPaused.value &&
    live.pauseReason.value?.text !== HIDDEN_TAB_NOTE.text,
);

useLiveToggleShortcut(() => live.toggle());
</script>

<template>
  <div
    v-if="isMounted && live.isEnabled.value"
    class="dms-live-toggle flex flex-wrap items-center gap-x-2.5 gap-y-1"
    :class="[ALIGN_CLASSES[align], `dms-live-toggle--${variant}`]"
  >
    <span
      v-if="live.isPaused.value"
      class="dms-live-toggle__status text-muted min-w-0 tabular-nums"
      :class="sizeClasses.text"
      aria-live="polite"
    >
      {{ pausedText }}
      <span v-if="detail" :class="detail.toneClass">· {{ detail.text }}</span>
    </span>
    <span
      v-else-if="showUpdatedAt"
      class="text-muted tabular-nums"
      :class="sizeClasses.text"
      aria-live="off"
    >
      {{ updatedLabel }}
    </span>
    <div
      v-if="variant === 'pill'"
      role="group"
      :aria-label="t('dms.live.aria_label')"
      class="border-default bg-default inline-flex shrink-0 items-stretch gap-0.5 rounded-md border p-0.5"
      :class="heightClass"
    >
      <button
        type="button"
        data-value="direct"
        :aria-pressed="live.isLive.value"
        :class="[
          PILL_BUTTON_CLASS,
          sizeClasses.pillButton,
          live.isLive.value ? 'bg-success/10 text-success' : PILL_IDLE_CLASS,
        ]"
        @click="live.resume()"
      >
        <span
          class="dms-live-toggle__dot size-2 rounded-full"
          :class="
            live.isLive.value
              ? 'bg-success motion-safe:animate-pulse'
              : 'bg-(--ui-border-accented)'
          "
        />
        {{ t("dms.live.direct") }}
      </button>
      <button
        type="button"
        data-value="pause"
        :aria-pressed="live.isPaused.value"
        :class="[
          PILL_BUTTON_CLASS,
          sizeClasses.pillButton,
          live.isPaused.value
            ? 'bg-elevated text-highlighted'
            : PILL_IDLE_CLASS,
        ]"
        @click="live.pause()"
      >
        <UIcon name="i-ph-pause-fill" class="size-3" />
        {{ t("dms.live.pause") }}
      </button>
    </div>
    <DmsSegmented
      v-else
      v-model="mode"
      :items="items"
      :aria-label="t('dms.live.aria_label')"
      :size="size"
    />
    <UButton
      v-if="variant === 'pill' && canResume"
      data-action="resume"
      :size="size"
      :class="heightClass"
      color="neutral"
      variant="soft"
      icon="i-ph-play-fill"
      :label="t('dms.live.resume')"
      @click="live.resume()"
    />
  </div>
</template>
