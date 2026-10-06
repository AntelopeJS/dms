<script setup lang="ts">
import { computed } from "vue";
import { tv } from "tailwind-variants";
import { DMS_TONE_WELL } from "../../build/utils/tone";
import type { Tone } from "../../types/tone";

export type IconWellSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
/**
 * The semantic tones plus `muted`, the quiet v2 .cs-rowicon (muted surface,
 * default border) used for settings rows and read notifications.
 */
export type IconWellTone = Tone | "muted";

interface IconWellProps {
  /** Iconify name (`i-ph-…`). Omit it to fill the well with the default slot. */
  icon?: string;
  /**
   * Tint, icon color and inset line. `neutral` is the raised v2 empty-state
   * well, `muted` the quiet row icon.
   */
  tone?: IconWellTone;
  /**
   * Tile size: `2xs` 28px (compact banner), `xs` 30px (matrix row, recent
   * module), `sm` 32px (status strip, list action), `md` 34px (settings row),
   * `lg` 36px (v2 default: modal header, nav card, empty state), `xl` 40px
   * (stat card, banner), `2xl` 44px (table empty state).
   */
  size?: IconWellSize;
  /** Accessible label; without one the well is decorative (`aria-hidden`). */
  label?: string;
}

interface IconWellSlots {
  /** Replaces the icon (initials, a glyph, a spinner…). */
  default?: () => unknown;
}

const props = withDefaults(defineProps<IconWellProps>(), {
  icon: undefined,
  tone: "primary",
  size: "lg",
  label: undefined,
});
defineSlots<IconWellSlots>();

// v2 .icon-well: a tinted rounded tile with an inset 1px line of its tone.
const theme = tv({
  slots: {
    root: "grid shrink-0 place-items-center ring-1 ring-inset",
    icon: "shrink-0",
  },
  variants: {
    size: {
      "2xs": { root: "size-7 rounded-[8px]", icon: "size-[15px]" },
      xs: { root: "size-[30px] rounded-[8px]", icon: "size-4" },
      sm: { root: "size-8 rounded-[9px]", icon: "size-4" },
      md: { root: "size-[34px] rounded-[9px]", icon: "size-[18px]" },
      lg: { root: "size-9 rounded-[10px]", icon: "size-[19px]" },
      xl: { root: "size-10 rounded-[10px]", icon: "size-[19px]" },
      "2xl": { root: "size-11 rounded-[10px]", icon: "size-[22px]" },
    },
  },
});

const ui = computed(() => theme({ size: props.size }));
const MUTED_WELL = "bg-(--dms-bg-muted) text-muted ring-(--ui-border)";

const toneClass = computed(() =>
  props.tone === "muted" ? MUTED_WELL : DMS_TONE_WELL[props.tone],
);
</script>

<template>
  <span
    :class="[ui.root(), toneClass]"
    :role="props.label ? 'img' : undefined"
    :aria-label="props.label"
    :aria-hidden="props.label ? undefined : 'true'"
  >
    <slot>
      <UIcon v-if="props.icon" :name="props.icon" :class="ui.icon()" />
    </slot>
  </span>
</template>
