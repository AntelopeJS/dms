<script setup lang="ts">
import { tv } from "tailwind-variants";
import { DmsLink } from "#dms/frontend-module";
import type { DmsTone } from "#dms-ui/app/build/utils/tone";
import type { StatusPillDot } from "#dms-ui/app/components/status-pill/StatusPill.vue";

// v2 .mc-tile, the frame of the Modules page's tiles: an installed module's
// card (a link into it) or a store module's dashed placeholder. Both read
// the same: icon and status, the name low in the tile, its description, a
// mono footer band.

/** The status pill of the tile's head. */
export interface ModuleTileStatus {
  tone: DmsTone;
  label: string;
  dot?: StatusPillDot;
}

interface ModuleTileProps {
  icon: string;
  title: string;
  description: string;
  status: ModuleTileStatus;
  /** Where the tile leads; without it, the tile is a placeholder. */
  to?: string;
}

interface ModuleTileSlots {
  /** Above the name (a live readout). */
  readout?: () => unknown;
  /** Under the description (an install command). */
  default?: () => unknown;
  /** The footer band's content. */
  footer: () => unknown;
}

const props = withDefaults(defineProps<ModuleTileProps>(), {
  to: undefined,
});
defineSlots<ModuleTileSlots>();

const theme = tv({
  slots: {
    root: "flex min-h-[228px] flex-col gap-3 overflow-hidden px-4 pt-4",
    footer:
      "text-dimmed -mx-4 mt-0.5 flex items-center gap-2 border-t border-(--ui-border-muted) ps-4 pe-3 font-mono text-[11px] font-medium",
  },
  variants: {
    isPlaceholder: {
      false: {
        root: "group dms-card dms-card--interactive text-inherit",
        footer: "bg-(--dms-bg-muted) py-[9px]",
      },
      // A dashed, transparent tile with a quiet icon: the module does not
      // run here.
      true: {
        root: "rounded-(--dms-radius-card) border border-dashed border-(--ui-border-accented)",
        footer: "py-[7px]",
      },
    },
  },
});

const ui = computed(() => theme({ isPlaceholder: !props.to }));
</script>

<template>
  <component
    :is="props.to ? DmsLink : 'article'"
    :to="props.to"
    :aria-label="props.to ? undefined : props.title"
    :class="ui.root()"
  >
    <div class="flex items-start justify-between gap-2.5">
      <DmsIconWell :icon="props.icon" :tone="props.to ? undefined : 'muted'" />
      <DmsStatusPill
        :tone="props.status.tone"
        :dot="props.status.dot"
        :label="props.status.label"
        size="sm"
        uppercase
      />
    </div>

    <slot name="readout" />

    <div
      class="text-highlighted mt-auto truncate text-lg font-[650] tracking-[-0.02em]"
    >
      {{ props.title }}
    </div>
    <p class="text-muted -mt-1.5 line-clamp-2 text-sm leading-[1.45]">
      {{ props.description }}
    </p>

    <slot />

    <div :class="ui.footer()">
      <slot name="footer" />
    </div>
  </component>
</template>
