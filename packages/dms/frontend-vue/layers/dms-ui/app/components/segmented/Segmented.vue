<script setup lang="ts">
import { MONO_CHIP_CLASS } from "../../build/utils/monoChip";
import { computed, ref } from "vue";

// Segmented toggle (design .segmented): a recessed track holding segments,
// the active one raised onto the card surface with a hairline ring.
// Single-select, v-model'd. Implements the radiogroup keyboard pattern
// (roving tabindex + arrow/Home/End, skipping disabled segments).
interface SegItem {
  label: string;
  value: string | number;
  icon?: string;
  /** Small mono counter after the label. */
  count?: string | number;
  disabled?: boolean;
}

type SegmentedSize = "xs" | "sm" | "md" | "lg" | "xl";
type SegmentedVariant = "default" | "mono";

interface Props {
  items: SegItem[];
  ariaLabel?: string;
  size?: SegmentedSize;
  /** "mono" = short mono labels (7D / 30D / 90D), used by period selectors. */
  variant?: SegmentedVariant;
  disabled?: boolean;
  /** Stretch the track to its container, segments sharing the width. */
  block?: boolean;
  /**
   * What a track wider than its container does: `scroll` (default) slides
   * sideways inside its pill, `wrap` breaks the segments onto more lines
   * (a short list of long labels on a phone, a narrow settings column).
   */
  overflow?: "scroll" | "wrap";
}

// v2 heights (24/28/32/36/40) live on the track; segments fill it.
const TRACK_SIZE_CLASSES: Record<SegmentedSize, string> = {
  xs: "h-6",
  sm: "h-7",
  md: "h-8",
  lg: "h-9",
  xl: "h-10",
};

// A wrapping track grows with its lines, so segments carry the height
// (the track's minus its 2px padding on each side).
const WRAP_ITEM_HEIGHT_CLASSES: Record<SegmentedSize, string> = {
  xs: "h-5",
  sm: "h-6",
  md: "h-7",
  lg: "h-8",
  xl: "h-9",
};

const ITEM_SIZE_CLASSES: Record<SegmentedSize, string> = {
  xs: "px-[7px] text-[11.5px]",
  sm: "px-2.5 text-[12.5px]",
  md: "px-3 text-[12.5px]",
  lg: "px-3.5 text-[13px]",
  xl: "px-4 text-sm",
};

const VARIANT_CLASSES: Record<SegmentedVariant, string> = {
  default: "",
  mono: "font-mono text-[11.5px] tracking-[0.02em]",
};

const ACTIVE_CLASS =
  "text-highlighted bg-(--dms-surface-card) font-semibold shadow-xs ring ring-accented";
const IDLE_CLASS = "text-muted hover:text-highlighted font-medium";
const DISABLED_CLASS = "cursor-not-allowed opacity-40";

const props = withDefaults(defineProps<Props>(), {
  size: "sm",
  variant: "default",
  disabled: false,
  block: false,
  overflow: "scroll",
});

const isWrapping = computed(() => props.overflow === "wrap");
const trackClass = computed(() => [
  isWrapping.value ? "h-auto flex-wrap" : TRACK_SIZE_CLASSES[props.size],
  props.block ? "flex w-full" : "inline-flex",
  props.disabled && "opacity-50",
]);

const model = defineModel<string | number>();

const itemRefs = ref<HTMLButtonElement[]>([]);

function isDisabled(index: number): boolean {
  return props.disabled || !!props.items[index]?.disabled;
}

// Roving tabindex anchor: the checked segment, or the first enabled one.
const focusIndex = computed(() => {
  const checked = props.items.findIndex((item) => item.value === model.value);
  if (checked !== -1) return checked;
  const firstEnabled = props.items.findIndex((_, index) => !isDisabled(index));
  return Math.max(firstEnabled, 0);
});

function select(index: number) {
  const item = props.items[index];
  if (!item || isDisabled(index)) return;
  model.value = item.value;
  itemRefs.value[index]?.focus();
}

type StepFn = (index: number, last: number) => number;

const NEXT: StepFn = (index, last) => (index === last ? 0 : index + 1);
const PREVIOUS: StepFn = (index, last) => (index === 0 ? last : index - 1);

/** Where a key lands first, and which way it walks past disabled segments. */
interface KeyMove {
  target: StepFn;
  direction: StepFn;
}

const KEY_MOVES: Record<string, KeyMove> = {
  ArrowRight: { target: NEXT, direction: NEXT },
  ArrowDown: { target: NEXT, direction: NEXT },
  ArrowLeft: { target: PREVIOUS, direction: PREVIOUS },
  ArrowUp: { target: PREVIOUS, direction: PREVIOUS },
  Home: { target: () => 0, direction: NEXT },
  End: { target: (_index, last) => last, direction: PREVIOUS },
};

function firstEnabledFrom(start: number, direction: StepFn): number {
  const last = props.items.length - 1;
  let index = start;
  for (let tries = 0; tries < props.items.length; tries++) {
    if (!isDisabled(index)) return index;
    index = direction(index, last);
  }
  return start;
}

function onKeydown(event: KeyboardEvent, index: number) {
  const move = KEY_MOVES[event.key];
  if (!move) return;
  event.preventDefault();
  const target = move.target(index, props.items.length - 1);
  select(firstEnabledFrom(target, move.direction));
}

// A track wider than its container (a phone, a narrow column) scrolls
// sideways inside its pill, or wraps with `overflow="wrap"`; the focus ring
// sits inside the segment so the scroll box never clips it. (No root-level
// template comment: it would break the class fallthrough.)
function itemClass(item: SegItem, index: number): (string | false)[] {
  const isActive = model.value === item.value;
  return [
    ITEM_SIZE_CLASSES[props.size],
    isWrapping.value ? WRAP_ITEM_HEIGHT_CLASSES[props.size] : "h-full",
    VARIANT_CLASSES[props.variant],
    isActive ? ACTIVE_CLASS : IDLE_CLASS,
    isDisabled(index) && DISABLED_CLASS,
    props.block && "flex-1 justify-center",
  ];
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    class="ring-default max-w-full [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-lg bg-(--dms-bg-muted) p-0.5 ring ring-inset"
    :class="trackClass"
  >
    <button
      v-for="(item, index) in items"
      :key="item.value"
      :ref="
        (el) => {
          if (el) itemRefs[index] = el as HTMLButtonElement;
        }
      "
      type="button"
      role="radio"
      :aria-checked="model === item.value"
      :disabled="isDisabled(index)"
      :tabindex="index === focusIndex ? 0 : -1"
      class="focus-visible:outline-primary inline-flex shrink-0 items-center gap-1.5 rounded-[6px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
      :class="itemClass(item, index)"
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <UIcon
        v-if="item.icon"
        :name="item.icon"
        class="size-3.5"
        :aria-hidden="true"
      />
      {{ item.label }}
      <span
        v-if="item.count !== undefined"
        :class="[
          MONO_CHIP_CLASS,
          'text-[10px] font-semibold',
          model === item.value
            ? 'text-primary bg-(--dms-accent-tint)'
            : 'text-dimmed bg-elevated',
        ]"
      >
        {{ item.count }}
      </span>
    </button>
  </div>
</template>
