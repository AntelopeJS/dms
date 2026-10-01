<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

export type FieldRowLayout = "inline" | "form" | "stack";

// The renderer's props are optional: DmsFieldRow is both the backend
// `FieldRow` block and a template component.
interface FieldRowProps extends Partial<DefaultComponentProps> {
  /** Row label (i18n key with `$` or literal). */
  label?: string;
  /** Help text under the label. */
  description?: string;
  /**
   * `inline`: label left, compact control right (switches, selects, buttons).
   * `form`: a 240px label column and a full-width control column.
   * `stack`: label above the control.
   */
  layout?: FieldRowLayout;
  /** Red asterisk after the label. */
  required?: boolean;
  /** Dims the whole row. */
  disabled?: boolean;
}

interface FieldRowSlots {
  /** The control (a switch, a select, a button, a child block…). */
  default?: () => unknown;
  /** Replaces the label text (a ListRow lead, a rich label). */
  label?: () => unknown;
  /** Inline after the label (a badge, a save status). */
  "label-extra"?: () => unknown;
}

const props = withDefaults(defineProps<FieldRowProps>(), {
  label: undefined,
  description: undefined,
  layout: "inline",
  required: false,
  disabled: false,
});
const slots = defineSlots<FieldRowSlots>();

// v2 .st-row: 16px/18px padding, hairline between rows of the same card.
const theme = tv({
  slots: {
    root: "grid gap-x-6 gap-y-2 border-t border-muted px-[18px] py-4 first:border-t-0",
    label:
      "flex flex-wrap items-center gap-2 text-[13px] font-semibold text-highlighted",
    required: "text-error",
    description: "mt-0.5 text-[12.5px] leading-normal text-muted",
    control: "min-w-0",
  },
  variants: {
    layout: {
      inline: {
        root: "grid-cols-[minmax(0,1fr)_auto] items-center max-sm:grid-cols-1",
        control:
          "flex flex-wrap items-center justify-end gap-2 max-sm:justify-start",
      },
      form: {
        root: "items-start md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
        control: "grid gap-3",
      },
      stack: {
        root: "grid-cols-1",
        control: "grid gap-3",
      },
    },
    disabled: {
      true: { root: "opacity-55" },
    },
  },
});

const ui = computed(() =>
  theme({ layout: props.layout, disabled: props.disabled }),
);
const { processI18n } = useTranslation();
</script>

<template>
  <div :class="ui.root()">
    <div v-if="props.label || props.description || slots.label">
      <div v-if="props.label || slots.label" :class="ui.label()">
        <slot name="label">{{ processI18n(props.label ?? "") }}</slot>
        <span v-if="props.required" :class="ui.required()" aria-hidden="true">
          *
        </span>
        <slot name="label-extra" />
      </div>
      <p v-if="props.description" :class="ui.description()">
        {{ processI18n(props.description) }}
      </p>
    </div>
    <div :class="ui.control()">
      <slot />
    </div>
  </div>
</template>
