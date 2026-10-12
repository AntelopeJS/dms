<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import DmsSegmented from "../segmented/Segmented.vue";
import { usePageLive } from "../../composables/live/usePageLive";
import { formatElapsed } from "../../build/composables/live/formatElapsed";
import { useLiveToggleShortcut } from "../../build/composables/live/useLiveToggleShortcut";
import { HIDDEN_TAB_NOTE } from "../../build/composables/live/pageLiveController";
import type { ConfirmTranslate } from "../../build/composables/confirm/confirmDialogTexts";
import {
  missedRowsText,
  showLiveNote,
} from "../../build/composables/live/liveNotes";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface LiveToggleBlockProps extends DefaultComponentProps {
  align?: "left" | "center" | "right";
  /** Shows "updated N s ago". */
  showUpdatedAt?: boolean;
  /** `segmented` (Live / Pause segments) or `pill` (a pulsing Live pill). */
  variant?: "segmented" | "pill";
  /** What the paused toggle calls the missed events, given `{count}`. */
  missedLabel?: string;
}

const props = withDefaults(defineProps<LiveToggleBlockProps>(), {
  align: "right",
  showUpdatedAt: true,
  variant: "segmented",
  missedLabel: undefined,
});

const DIRECT = "direct";
const PAUSE = "pause";
const TICK_MS = 1000;
const ALIGN_CLASSES: Record<
  NonNullable<LiveToggleBlockProps["align"]>,
  string
> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const PILL_BUTTON_CLASS =
  "focus-visible:outline-primary flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2";
const PILL_IDLE_CLASS = "text-muted hover:text-default hover:bg-elevated";

const { t } = useI18n();
const translate = t as ConfirmTranslate;
const live = usePageLive();

// The state lives in the browser (its storage, its clock): the server and the
// hydrating render draw nothing, the mounted block draws the real state.
const isMounted = ref(false);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  isMounted.value = true;
  if (props.showUpdatedAt) {
    ticker = setInterval(() => (now.value = Date.now()), TICK_MS);
  }
});
onBeforeUnmount(() => clearInterval(ticker));

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
  const at = live.lastUpdatedAt.value;
  if (at === null) return "";
  const { unit, count } = formatElapsed(now.value - at);
  const updated = t(`dms.live.updated_${unit}`, { count }, count);
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
      class="dms-live-toggle__status text-muted min-w-0 text-[12.5px] tabular-nums"
      aria-live="polite"
    >
      {{ pausedText }}
      <span v-if="detail" :class="detail.toneClass">· {{ detail.text }}</span>
    </span>
    <span
      v-else-if="showUpdatedAt"
      class="text-muted text-[12.5px] tabular-nums"
      aria-live="off"
    >
      {{ updatedLabel }}
    </span>
    <div
      v-if="variant === 'pill'"
      role="group"
      :aria-label="t('dms.live.aria_label')"
      class="border-default bg-default inline-flex shrink-0 items-center gap-0.5 rounded-md border p-0.5"
    >
      <button
        type="button"
        data-value="direct"
        :aria-pressed="live.isLive.value"
        :class="[
          PILL_BUTTON_CLASS,
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
      size="sm"
    />
    <UButton
      v-if="variant === 'pill' && canResume"
      data-action="resume"
      size="xs"
      color="neutral"
      variant="soft"
      icon="i-ph-play-fill"
      :label="t('dms.live.resume')"
      @click="live.resume()"
    />
  </div>
</template>
