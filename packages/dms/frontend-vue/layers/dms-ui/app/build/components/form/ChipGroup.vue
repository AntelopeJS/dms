<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";

// The one row of pill chips of the DMS (v2 .mc-cat): one pick among them
// (a radio group: the modules' categories) or several (toggles with a check:
// the roles of an invitation). Attributes (`id`, `aria-describedby`…) go to
// the group.

/** One chip: its value, its label and, optionally, a mono count after it. */
export interface ChipGroupItem {
  value: string;
  label: string;
  count?: number;
}

interface ChipGroupProps {
  items: readonly ChipGroupItem[];
  /** The picked values. */
  selected: readonly string[];
  /** Accessible name of the group. */
  label: string;
  /** Several chips can be picked, each toggled on its own. */
  multiple?: boolean;
  disabled?: boolean;
  /** Rings the chips not picked in the error ink. */
  invalid?: boolean;
}

const props = withDefaults(defineProps<ChipGroupProps>(), {
  multiple: false,
  disabled: false,
  invalid: false,
});

const emit = defineEmits<{
  /** A chip was pressed: picked, or toggled when `multiple`. */
  pick: [value: string];
}>();

const CHECK_ICON = "i-ph-check";

const theme = tv({
  slots: {
    chip: "focus-visible:outline-primary inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-[11px] text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
    count: "font-mono text-[10.5px] text-dimmed",
  },
  variants: {
    picked: {
      true: {
        chip: "border-primary bg-primary/10 text-primary font-semibold",
        count: "text-primary opacity-70",
      },
      false: {
        chip: "border-accented text-toned hover:bg-elevated hover:text-highlighted",
      },
    },
    invalid: { true: "" },
    disabled: {
      true: { chip: "cursor-not-allowed opacity-40" },
    },
  },
  compoundVariants: [
    { picked: false, invalid: true, class: { chip: "border-error" } },
  ],
});

const pickedValues = computed(() => new Set(props.selected));
const isPicked = (item: ChipGroupItem) => pickedValues.value.has(item.value);
const ui = (item: ChipGroupItem) =>
  theme({
    picked: isPicked(item),
    invalid: props.invalid,
    disabled: props.disabled,
  });

// A single pick reads as radios, several as toggle buttons.
const groupRole = computed(() => (props.multiple ? "group" : "radiogroup"));
const chipAria = (item: ChipGroupItem) =>
  props.multiple
    ? { "aria-pressed": isPicked(item) }
    : { role: "radio", "aria-checked": isPicked(item) };
</script>

<template>
  <div
    class="flex flex-wrap gap-1.5"
    :role="groupRole"
    :aria-label="props.label"
    :aria-disabled="props.disabled || undefined"
  >
    <button
      v-for="item in props.items"
      :key="item.value"
      type="button"
      v-bind="chipAria(item)"
      :data-value="item.value"
      :disabled="props.disabled"
      :class="ui(item).chip()"
      @click="emit('pick', item.value)"
    >
      <UIcon
        v-if="props.multiple && isPicked(item)"
        :name="CHECK_ICON"
        class="size-3"
      />
      {{ item.label }}
      <span v-if="item.count !== undefined" :class="ui(item).count()">
        {{ item.count }}
      </span>
    </button>
  </div>
</template>
