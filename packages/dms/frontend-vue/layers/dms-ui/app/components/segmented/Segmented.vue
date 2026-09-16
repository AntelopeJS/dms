<script setup lang="ts">
import { computed, ref } from "vue";

// Segmented toggle (design .segmented): a recessed track holding pill
// segments, the active one raised onto the card surface with a soft shadow.
// Single-select, v-model'd. Implements the radiogroup keyboard pattern
// (roving tabindex + arrow/Home/End) for WCAG-correct a11y.
interface SegItem {
  label: string;
  value: string | number;
  icon?: string;
}

type SegmentedSize = "xs" | "sm" | "md" | "lg" | "xl";

interface Props {
  items: SegItem[];
  ariaLabel?: string;
  size?: SegmentedSize;
}

const SIZE_CLASSES: Record<SegmentedSize, string> = {
  xs: "h-[26px] px-2.5 text-[11.5px]",
  sm: "h-[30px] px-3.5 text-[12.5px]",
  md: "h-[34px] px-4 text-[13.5px]",
  lg: "h-[38px] px-5 text-sm",
  xl: "h-[44px] px-6 text-[15px]",
};

const props = withDefaults(defineProps<Props>(), {
  size: "sm",
});

const model = defineModel<string | number>();

const itemRefs = ref<HTMLButtonElement[]>([]);

// Roving tabindex anchor: the checked segment, or the first one if none.
const focusIndex = computed(() => {
  const i = props.items.findIndex((item) => item.value === model.value);
  return i === -1 ? 0 : i;
});

function select(index: number) {
  const item = props.items[index];
  if (!item) return;
  model.value = item.value;
  itemRefs.value[index]?.focus();
}

const KEY_NAVIGATORS: Record<string, (index: number, last: number) => number> =
  {
    ArrowRight: (index, last) => (index === last ? 0 : index + 1),
    ArrowDown: (index, last) => (index === last ? 0 : index + 1),
    ArrowLeft: (index, last) => (index === 0 ? last : index - 1),
    ArrowUp: (index, last) => (index === 0 ? last : index - 1),
    Home: () => 0,
    End: (_index, last) => last,
  };

function onKeydown(event: KeyboardEvent, index: number) {
  const navigate = KEY_NAVIGATORS[event.key];
  if (!navigate) return;
  event.preventDefault();
  select(navigate(index, props.items.length - 1));
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel"
    class="ring-default bg-muted dark:bg-default inline-flex gap-0.5 rounded-md p-[3px] ring ring-inset"
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
      :tabindex="index === focusIndex ? 0 : -1"
      class="inline-flex items-center gap-1.5 rounded-md font-semibold transition-colors"
      :class="[
        SIZE_CLASSES[size],
        model === item.value
          ? 'text-default bg-(--dms-surface-card) shadow-sm'
          : 'text-muted hover:text-default',
      ]"
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <UIcon
        v-if="item.icon"
        :name="item.icon"
        class="size-3.5"
        aria-hidden="true"
      />
      {{ item.label }}
    </button>
  </div>
</template>
