<script setup lang="ts">
import { ref } from "vue";
import type { MatrixTone } from "../../../types/matrix";

/**
 * The status filter's segments ("All 120", "Missing 12"): a radio group in
 * the DMS segmented look, each segment led by a dot in its filter's `tone`
 * and followed by its count. Arrows, Home and End move between segments.
 */
export interface MatrixStatusSegment {
  value: string;
  label: string;
  tone?: MatrixTone;
  count?: number;
}

interface MatrixStatusSegmentsProps {
  items: MatrixStatusSegment[];
  modelValue: string;
  ariaLabel?: string;
}

const props = withDefaults(defineProps<MatrixStatusSegmentsProps>(), {
  ariaLabel: undefined,
});
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const TONE_DOTS: Record<MatrixTone, string> = {
  neutral: "bg-(--ui-border-accented)",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

type IndexMove = (index: number, last: number) => number;

const KEY_MOVES: Record<string, IndexMove> = {
  ArrowRight: (index, last) => (index >= last ? 0 : index + 1),
  ArrowDown: (index, last) => (index >= last ? 0 : index + 1),
  ArrowLeft: (index, last) => (index <= 0 ? last : index - 1),
  ArrowUp: (index, last) => (index <= 0 ? last : index - 1),
  Home: () => 0,
  End: (_index, last) => last,
};

const buttons = ref<HTMLButtonElement[]>([]);

function onKeydown(event: KeyboardEvent, index: number): void {
  const move = KEY_MOVES[event.key];
  if (!move) return;
  event.preventDefault();
  const next = move(index, props.items.length - 1);
  const item = props.items[next];
  if (!item) return;
  emit("update:modelValue", item.value);
  buttons.value[next]?.focus();
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="props.ariaLabel"
    class="ring-default inline-flex max-w-full [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-lg bg-(--dms-bg-muted) p-0.5 ring ring-inset"
  >
    <button
      v-for="(item, index) in props.items"
      :key="item.value"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="props.modelValue === item.value"
      :tabindex="props.modelValue === item.value ? 0 : -1"
      class="focus-visible:outline-primary inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
      :class="
        props.modelValue === item.value
          ? 'text-highlighted ring-default bg-(--dms-surface-card) shadow-xs ring'
          : 'text-muted hover:text-highlighted'
      "
      @click="emit('update:modelValue', item.value)"
      @keydown="onKeydown($event, index)"
    >
      <span
        v-if="item.tone"
        class="size-1.5 shrink-0 rounded-full"
        :class="TONE_DOTS[item.tone]"
        aria-hidden="true"
      />
      {{ item.label }}
      <span
        v-if="item.count !== undefined"
        class="rounded-[4px] px-1 font-mono text-[10px] font-semibold tabular-nums"
        :class="
          props.modelValue === item.value
            ? 'text-primary bg-(--dms-accent-tint)'
            : 'text-dimmed bg-elevated'
        "
      >
        {{ item.count }}
      </span>
    </button>
  </div>
</template>
