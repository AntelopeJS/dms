<script setup lang="ts">
import { computed } from "vue";
import DmsIconWell, { type IconWellSize } from "../icon-well/IconWell.vue";
import type { SemanticColor } from "../../utils/semanticTint";

// DMS-styled notice banner (design .banner): a left-to-right tinted wash over
// the card surface with a boxed leading icon, used for module beta / info
// notices. Wraps UAlert so we keep its a11y + slots while pinning the exact
// reference look. The `cli` slot hosts the optional inset command box
// (compose with DmsCopyButton), `actions` the right-aligned buttons.
type BannerTone = Exclude<SemanticColor, "neutral">;
type BannerSize = "sm" | "md";

interface BannerProps {
  title?: string;
  description?: string;
  icon?: string;
  /** Colour of the wash and the icon well. */
  tone?: BannerTone;
  /** "sm" is the compact one-line banner: title and description inline. */
  size?: BannerSize;
  /** Adds a close button; the banner emits `dismiss` when it is pressed. */
  dismissible?: boolean;
}

interface BannerEmits {
  (e: "dismiss"): void;
}

interface BannerSlots {
  /** Rich description body (overrides the `description` prop). */
  description?: () => unknown;
  /** Optional inset command/CLI box rendered under the description. */
  cli?: () => unknown;
  /** Right-aligned actions, vertically centred. */
  actions?: () => unknown;
}

const props = withDefaults(defineProps<BannerProps>(), {
  title: undefined,
  description: undefined,
  icon: "i-ph-warning",
  tone: "warning",
  size: "md",
  dismissible: false,
});

const emit = defineEmits<BannerEmits>();
const slots = defineSlots<BannerSlots>();

// Literal class maps (Tailwind needs the full class string to extract them —
// no dynamic `bg-${color}` interpolation).
const SURFACE: Record<BannerTone, string> = {
  warning: "border-warning/40 from-warning/10",
  info: "border-info/40 from-info/10",
  primary: "border-primary/40 from-primary/10",
  success: "border-success/40 from-success/10",
  error: "border-error/40 from-error/10",
};

const SIZE_ROOT: Record<BannerSize, string> = {
  md: "gap-3.5 rounded-(--dms-radius-card) px-4 py-3.5",
  sm: "gap-2.5 rounded-[10px] px-3 py-2",
};

const SIZE_WELL: Record<BannerSize, IconWellSize> = {
  md: "xl",
  sm: "2xs",
};

// Compact banners run the description on the title line.
const SIZE_WRAPPER: Record<BannerSize, string> = {
  md: "min-w-0",
  sm: "min-w-0 flex-row flex-wrap items-baseline gap-x-2",
};

const SIZE_DESCRIPTION: Record<BannerSize, string> = {
  md: "mt-0.5",
  sm: "mt-0",
};

const DISMISS_BUTTON = {
  size: "xs",
  color: "neutral",
  variant: "ghost",
} as const;

// color="neutral" on UAlert below → no semantic bg/text injected; we own the
// whole surface here: the card background under a 100deg tint that fades out
// at 70%, like the reference.
const alertUi = computed(() => ({
  // On a phone the actions wrap under the text instead of squeezing it. Nuxt
  // UI renders the dismiss button inside the actions box: a banner with no
  // actions keeps that box (the lone dismiss) on the text line.
  root: `items-center border ring-0 bg-default bg-linear-100 to-transparent to-70% max-sm:flex-wrap ${SIZE_ROOT[props.size]} ${SURFACE[props.tone]}`,
  wrapper: SIZE_WRAPPER[props.size],
  title: "text-highlighted text-sm font-[650]",
  description: `text-muted text-[13px] leading-relaxed ${SIZE_DESCRIPTION[props.size]}`,
  actions: `items-center gap-2 mt-0 ${slots.actions ? "max-sm:basis-full max-sm:flex-wrap" : ""}`,
}));

function onOpenChange(open: boolean) {
  if (!open) emit("dismiss");
}
</script>

<template>
  <UAlert
    color="neutral"
    variant="soft"
    orientation="horizontal"
    :title="title"
    :description="description"
    :close="dismissible ? DISMISS_BUTTON : false"
    :ui="alertUi"
    @update:open="onOpenChange"
  >
    <template #leading>
      <DmsIconWell :icon="icon" :tone="tone" :size="SIZE_WELL[size]" />
    </template>

    <template v-if="slots.description || slots.cli" #description>
      <slot name="description">{{ description }}</slot>
      <div v-if="slots.cli" class="mt-2.5">
        <slot name="cli" />
      </div>
    </template>

    <template v-if="slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UAlert>
</template>
