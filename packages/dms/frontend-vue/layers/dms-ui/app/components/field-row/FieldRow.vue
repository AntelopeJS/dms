<script setup lang="ts">
import { type Slot, computed } from "vue";
import { tv } from "tailwind-variants";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

export type FieldRowLayout = "inline" | "form" | "stack";

/**
 * `row`: the row pads itself and draws a hairline above the next one (rows
 * of a card). `dense`: the same, tighter, for a form in a drawer or a modal.
 * `list`: the list around it spaces the rows (a stacked form).
 */
export type FieldRowSpacing = "row" | "dense" | "list";

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
  /** Id of the control the label names: the label becomes a `<label>`. */
  labelFor?: string;
  /** The card's 18px side inset; off when the surface around pads it. */
  inset?: boolean;
  spacing?: FieldRowSpacing;
  /** Red asterisk after the label. */
  required?: boolean;
  /** Dims the whole row. */
  disabled?: boolean;
  /**
   * `stack` only: the row and its control fill the height their flex parent
   * leaves them (a drawer's body), handing it to a control that fills it
   * (`DmsInputCode fill`).
   */
  fill?: boolean;
}

interface FieldRowSlots {
  /** The control (a switch, a select, a button, a child block…). */
  default?: () => ReturnType<Slot>;
  /** Replaces the label text (a ListRow lead, a rich label). */
  label?: () => ReturnType<Slot>;
  /** Inline after the label (a badge, a save status). */
  "label-extra"?: () => ReturnType<Slot>;
  /** Under the description, outside the label (a save status with a retry). */
  details?: () => ReturnType<Slot>;
}

const props = withDefaults(defineProps<FieldRowProps>(), {
  label: undefined,
  description: undefined,
  layout: "inline",
  labelFor: undefined,
  inset: true,
  spacing: "row",
  required: false,
  disabled: false,
  fill: false,
});
const slots = defineSlots<FieldRowSlots>();

const theme = tv({
  slots: {
    root: "@container",
    body: "grid gap-x-6 gap-y-2",
    label:
      "flex flex-wrap items-center gap-2 text-[13px] font-semibold text-highlighted",
    required: "text-error",
    description: "mt-0.5 text-[12.5px] leading-normal text-muted",
    text: "",
    control: "min-w-0",
  },
  variants: {
    layout: {
      inline: {
        body: "flex flex-wrap items-center",
        text: "min-w-0 flex-[1_1_11rem]",
        control: "ms-auto flex flex-wrap items-center justify-end gap-2",
      },

      form: {
        body: "items-start @min-[560px]:grid-cols-[minmax(0,240px)_minmax(0,1fr)]",
        text: "@min-[560px]:pt-1.5",
        control: "grid gap-3",
      },
      stack: {
        body: "grid-cols-1",
        control: "grid gap-3",
      },
    },
    inset: {
      true: { body: "px-[18px]" },
    },
    spacing: {
      row: { root: "border-t border-muted first:border-t-0", body: "py-4" },

      dense: {
        root: "border-t border-muted first:border-t-0",
        body: "py-3 gap-y-1.5",
      },
      list: { body: "gap-y-1.5" },
    },
    disabled: {
      true: { root: "opacity-55" },
    },

    fill: {
      true: {
        root: "flex flex-1 flex-col",
        body: "flex flex-1 flex-col",
        control: "flex flex-1 flex-col",
      },
    },

    labeled: {
      false: { control: "col-span-full" },
    },
  },
});

const hasText = computed(
  () => !!(props.label || props.description || slots.label || slots.details),
);
const ui = computed(() =>
  theme({
    layout: props.layout,
    inset: props.inset,
    spacing: props.spacing,
    disabled: props.disabled,
    fill: props.fill && props.layout === "stack",
    labeled: hasText.value,
  }),
);
const labelTag = computed(() => (props.labelFor ? "label" : "div"));
useWatch(props.watchActions || [], props.componentId);

const { processI18n } = useTranslation();
</script>

<template>
  <div :class="ui.root()">
    <div :class="ui.body()">
      <div v-if="hasText" :class="ui.text()">
        <component
          :is="labelTag"
          v-if="props.label || slots.label"
          :for="props.labelFor"
          :class="ui.label()"
        >
          <slot name="label">{{ processI18n(props.label ?? "") }}</slot>
          <span v-if="props.required" :class="ui.required()" aria-hidden="true">
            *
          </span>
          <slot name="label-extra" />
        </component>
        <p v-if="props.description" :class="ui.description()">
          {{ processI18n(props.description) }}
        </p>
        <slot name="details" />
      </div>
      <div :class="ui.control()">
        <slot />
      </div>
    </div>
  </div>
</template>
