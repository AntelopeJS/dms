<script setup lang="ts">
import { computed } from "vue";
import type { SemanticColor } from "../../utils/semanticTint";

// DMS-styled notice banner (design .banner): soft tinted gradient surface with
// a boxed leading icon, used for module beta / info notices. Wraps UAlert so we
// keep its a11y + slots while pinning the exact reference look. The `cli` slot
// hosts the optional inset command box (compose with DmsCopyButton).
type BannerColor = Exclude<SemanticColor, "neutral">;

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    icon?: string;
    color?: BannerColor;
  }>(),
  {
    icon: "i-ph-warning",
    color: "warning",
  },
);

defineSlots<{
  /** Rich description body (overrides the `description` prop). */
  description?: () => unknown;
  /** Optional inset command/CLI box rendered under the description. */
  cli?: () => unknown;
}>();

// Literal class maps (Tailwind needs the full class string to extract them —
// no dynamic `bg-${color}` interpolation).
const SURFACE: Record<BannerColor, string> = {
  warning: "border-warning/25 from-warning/[0.07] to-warning/[0.015]",
  info: "border-info/25 from-info/[0.07] to-info/[0.015]",
  primary: "border-primary/25 from-primary/[0.07] to-primary/[0.015]",
  success: "border-success/25 from-success/[0.07] to-success/[0.015]",
  error: "border-error/25 from-error/[0.07] to-error/[0.015]",
};

const ICON_BOX: Record<BannerColor, string> = {
  warning: "bg-warning/20 ring-warning/40 text-warning",
  info: "bg-info/20 ring-info/40 text-info",
  primary: "bg-primary/20 ring-primary/40 text-primary",
  success: "bg-success/20 ring-success/40 text-success",
  error: "bg-error/20 ring-error/40 text-error",
};

// color="neutral" on UAlert below → no semantic bg/text injected; we own the
// whole surface here (bg-transparent kills the variant's base color, the
// gradient image is the only fill — matching the very subtle reference wash).
const rootUi = computed(
  () =>
    `items-start gap-4 rounded-xl border p-[18px] ring-0 bg-transparent bg-linear-to-b ${SURFACE[props.color]}`,
);

const iconBoxClass = computed(
  () =>
    `grid size-[42px] shrink-0 place-items-center rounded-lg ring-1 ${ICON_BOX[props.color]}`,
);
</script>

<template>
  <UAlert
    color="neutral"
    variant="soft"
    :title="title"
    :description="description"
    :ui="{
      root: rootUi,
      wrapper: 'min-w-0',
      title: 'text-highlighted text-[15.5px] font-semibold',
      description: 'text-toned text-[13.5px] leading-relaxed',
    }"
  >
    <template #leading>
      <div :class="iconBoxClass">
        <UIcon :name="icon" class="size-[21px]" :aria-hidden="true" />
      </div>
    </template>

    <template v-if="$slots.description" #description>
      <slot name="description" />
    </template>

    <template v-if="$slots.cli" #actions>
      <slot name="cli" />
    </template>
  </UAlert>
</template>
