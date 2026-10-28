<script setup lang="ts">
import { tv } from "tailwind-variants";
import type { Slot } from "vue";
import { DmsLink } from "#dms/frontend-module";
import type { Tone } from "#dms-ui/app/types/tone";
import type { StatusPillDot } from "#dms-ui/app/components/status-pill/StatusPill.vue";

/** The status pill of the tile's head. */
export interface ModuleTileStatus {
  tone: Tone;
  label: string;
  dot?: StatusPillDot;
}

interface ModuleTileProps {
  icon: string;
  title: string;
  description: string;
  /** The pill of the tile's head; a tile without one shows none. */
  status?: ModuleTileStatus;
  /** Where the tile leads; without it, the tile is a placeholder. */
  to?: string;
  /**
   * A tile with no link that still stands for a module running here (one
   * the store manages): drawn solid rather than dashed.
   */
  isSolid?: boolean;
}

interface ModuleTileSlots {
  /** Under the description (a live readout). */
  readout?: Slot;
  /** Under the description (an install command). */
  default?: Slot;
  /**
   * The footer band's content. The band wraps: a facts group (version,
   * source, category) kept whole, then actions pushed to the end with
   * `ms-auto`, which drop to a second line when both do not fit.
   */
  footer: Slot;
}

const props = withDefaults(defineProps<ModuleTileProps>(), {
  status: undefined,
  to: undefined,
  isSolid: false,
});
defineSlots<ModuleTileSlots>();

const theme = tv({
  slots: {
    root: "flex min-h-[228px] flex-col gap-3 overflow-hidden px-4 pt-4",
    footer:
      "text-dimmed -mx-4 mt-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-(--ui-border-muted) ps-4 pe-3 font-mono text-[11px] font-medium",
  },
  variants: {
    isPlaceholder: {
      false: {
        root: "group dms-card dms-card--interactive text-inherit",
        footer: "bg-(--dms-bg-muted) py-[9px]",
      },

      true: {
        root: "rounded-(--dms-radius-card) border border-dashed border-(--ui-border-accented)",
        footer: "py-[7px]",
      },
    },
    isSolid: {
      true: {
        root: "dms-card border-solid",
        footer: "bg-(--dms-bg-muted) py-[7px]",
      },
    },
  },
});

const ui = computed(() =>
  theme({ isPlaceholder: !props.to, isSolid: !props.to && props.isSolid }),
);
</script>

<template>
  <component
    :is="props.to ? DmsLink : 'article'"
    :to="props.to"
    :aria-label="props.to ? undefined : props.title"
    :class="ui.root()"
  >
    <div class="flex items-start justify-between gap-2.5">
      <DmsIconWell
        :icon="props.icon"
        :tone="props.to || props.isSolid ? undefined : 'muted'"
      />
      <DmsStatusPill
        v-if="props.status"
        :tone="props.status.tone"
        :dot="props.status.dot"
        :label="props.status.label"
        size="sm"
        uppercase
      />
    </div>

    <div
      class="text-highlighted truncate text-lg font-[650] tracking-[-0.02em]"
    >
      {{ props.title }}
    </div>
    <p class="text-muted -mt-1.5 line-clamp-2 text-sm leading-[1.45]">
      {{ props.description }}
    </p>

    <slot name="readout" />

    <slot />

    <div :class="ui.footer()">
      <slot name="footer" />
    </div>
  </component>
</template>
