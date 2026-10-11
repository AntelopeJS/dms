<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import DmsSegmented from "../segmented/Segmented.vue";
import { usePageLive } from "../../composables/live/usePageLive";
import { formatElapsed } from "../../build/composables/live/formatElapsed";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

interface LiveToggleBlockProps extends DefaultComponentProps {
  align?: "left" | "center" | "right";
  /** Shows "updated N s ago". */
  showUpdatedAt?: boolean;
}

const props = withDefaults(defineProps<LiveToggleBlockProps>(), {
  align: "right",
  showUpdatedAt: true,
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

const { t } = useI18n();
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
  return t(`dms.live.updated_${unit}`, { count }, count);
});

defineShortcuts({ l: () => live.toggle() });
</script>

<template>
  <div
    v-if="isMounted && live.isEnabled.value"
    class="dms-live-toggle flex flex-wrap items-center gap-2.5"
    :class="ALIGN_CLASSES[align]"
  >
    <span
      v-if="showUpdatedAt"
      class="text-muted text-[12.5px] tabular-nums"
      aria-live="off"
    >
      {{ updatedLabel }}
    </span>
    <DmsSegmented
      v-model="mode"
      :items="items"
      :aria-label="t('dms.live.aria_label')"
      size="sm"
    />
  </div>
</template>
