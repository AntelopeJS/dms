<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import type { ButtonProps } from "@nuxt/ui";
import DmsIconWell, { type IconWellSize } from "../icon-well/IconWell.vue";
import type { DmsTone } from "../../utils/tone";

export type EmptyStateVariant = "no-data" | "no-result" | "no-access" | "error";
export type EmptyStateSize = "sm" | "md" | "lg";

interface EmptyStateProps {
  title: string;
  /** Short explanation (the default slot overrides it, for rich text). */
  description?: string;
  /**
   * Why it is empty; sets the default icon, the well tone and the live role
   * (`error` is announced as an alert, the others as a status).
   */
  variant?: EmptyStateVariant;
  /** Overrides the variant's icon. */
  icon?: string;
  /** Overrides the variant's well tone. */
  tone?: DmsTone;
  /** Hatched panel behind the content (table body, empty card) vs bare. */
  framed?: boolean;
  /**
   * `sm` compact (table row, chart, top list), `md` v2 .c-empty (card body),
   * `lg` table empty state (44px well, more air).
   */
  size?: EmptyStateSize;
  /** Buttons under the text; the `actions` slot replaces them. */
  actions?: ButtonProps[];
}

interface EmptyStateSlots {
  /** Rich description, replaces `description`. */
  default?: () => unknown;
  /** Buttons or links under the text. */
  actions?: () => unknown;
}

const props = withDefaults(defineProps<EmptyStateProps>(), {
  description: undefined,
  variant: "no-data",
  icon: undefined,
  tone: undefined,
  framed: false,
  size: "md",
  actions: undefined,
});
const slots = defineSlots<EmptyStateSlots>();

const VARIANT_ICONS: Record<EmptyStateVariant, string> = {
  "no-data": "i-ph-tray",
  "no-result": "i-ph-magnifying-glass",
  "no-access": "i-ph-lock-simple",
  error: "i-ph-warning-circle",
};

const WELL_SIZES: Record<EmptyStateSize, IconWellSize> = {
  sm: "lg",
  md: "lg",
  lg: "2xl",
};

// v2 .c-empty: icon well, title, a short explanation and the actions that
// fit the case, centred.
const theme = tv({
  slots: {
    root: "relative grid justify-items-center gap-1.5 text-center",
    well: "mb-1.5",
    title: "text-highlighted",
    description: "text-muted",
    actions: "mt-2.5 flex flex-wrap items-center justify-center gap-2",
  },
  variants: {
    size: {
      sm: {
        root: "px-5 py-8",
        title: "text-[13px] font-semibold",
        description: "max-w-[40ch] text-[12.5px]",
      },
      md: {
        root: "px-5 pt-9 pb-8",
        title: "text-sm font-semibold",
        description: "max-w-[46ch] text-[13px]",
      },
      lg: {
        root: "px-6 py-11",
        well: "mb-2 shadow-sm",
        title: "text-sm font-[650]",
        description: "max-w-80 text-[13px]",
        actions: "mt-3",
      },
    },
    framed: {
      true: {
        root: "bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-text-highlighted)_5%,transparent)_0_1px,transparent_1px_10px)]",
      },
    },
  },
});

const ui = computed(() => theme({ size: props.size, framed: props.framed }));
const resolvedIcon = computed(() => props.icon ?? VARIANT_ICONS[props.variant]);
const resolvedTone = computed<DmsTone>(
  () => props.tone ?? (props.variant === "error" ? "error" : "neutral"),
);
const hasDescription = computed(() => !!props.description || !!slots.default);
const hasActions = computed(() => !!slots.actions || !!props.actions?.length);
</script>

<template>
  <div
    :class="ui.root()"
    :role="props.variant === 'error' ? 'alert' : 'status'"
  >
    <DmsIconWell
      :icon="resolvedIcon"
      :tone="resolvedTone"
      :size="WELL_SIZES[props.size]"
      :class="ui.well()"
    />
    <p :class="ui.title()">{{ props.title }}</p>
    <p v-if="hasDescription" :class="ui.description()">
      <slot>{{ props.description }}</slot>
    </p>
    <div v-if="hasActions" :class="ui.actions()">
      <slot name="actions">
        <UButton
          v-for="(action, index) in props.actions"
          :key="index"
          size="sm"
          v-bind="action"
        />
      </slot>
    </div>
  </div>
</template>
