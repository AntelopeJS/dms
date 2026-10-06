<script setup lang="ts">
import { tv } from "tailwind-variants";
import { computed } from "vue";

// Block permission veil (v2 card "Locked"): shows what a role would lose on a
// block without taking the block away.
// - hidden: the content stays in place but inert under a hatched veil, with a
//   centred error lock badge.
// - readonly / limited: the content is untouched; a warning badge sits on the
//   top-right edge, its tooltip naming what is withheld.
// - partial (an entry to a page the role opens without all of it, e.g. a
//   settings card): the content stays usable under a light warning hatch,
//   with a warning lock badge on the top-right edge.
// Without a state the slot renders alone, with no wrapper element, unless the
// veil is `persistent`.
interface Props {
  state?: "hidden" | "readonly" | "limited" | "partial" | null;
  /** Badge text, e.g. "Hidden for Support". */
  label?: string;
  /** Tooltip of the badge, e.g. the withheld actions. */
  detail?: string;
  /**
   * Keep the wrapper elements (as `display: contents`) while there is no
   * state, so a state change only restyles the wrapper and never remounts the
   * slot content. Needed whenever the state can change under live content: a
   * remount loses the content's state and refetches it, and remounting a
   * component with an async setup while the page's Suspense waits for the
   * next page made Vue mount it under a detached placeholder (`insertBefore`
   * on a null parent).
   */
  persistent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  state: null,
  label: "",
  detail: undefined,
  persistent: false,
});

const veil = tv({
  slots: {
    root: "relative isolate min-w-0",
    veil: [
      "pointer-events-auto absolute inset-0 z-10 rounded-[inherit] backdrop-blur-[3px]",
      "bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-bg)_84%,transparent)_0_10px,color-mix(in_srgb,var(--ui-bg)_70%,transparent)_10px_20px)]",
    ],
    badge: [
      "absolute z-20 inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap backdrop-blur-md",
      "font-mono text-[10.5px] font-[650] tracking-[0.08em] uppercase",
    ],
    icon: "size-[13px] shrink-0",
  },
  variants: {
    hidden: {
      true: {
        root: "overflow-hidden rounded-(--dms-radius-card)",
        badge:
          "text-error top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-(--dms-error-line) bg-(--dms-error-tint)",
      },
      false: {
        // On the block's top edge rather than inside it, so it never covers
        // the block's own toolbar; opaque, so the edge does not show through.
        badge:
          "text-warning -top-3 right-4 border-(--dms-warning-line) [background:linear-gradient(var(--dms-warning-tint),var(--dms-warning-tint)),var(--ui-bg)]",
      },
    },
    // The content stays reachable: the hatch lets every pointer through and
    // leaves the text readable (no blur).
    partial: {
      true: {
        root: "rounded-(--dms-radius-card)",
        veil: "pointer-events-none backdrop-blur-none bg-[repeating-linear-gradient(-45deg,color-mix(in_srgb,var(--ui-warning)_10%,transparent)_0_10px,transparent_10px_20px)]",
      },
    },
  },
});

const isHidden = computed(() => props.state === "hidden");
const isPartial = computed(() => props.state === "partial");
const ui = computed(() =>
  veil({ hidden: isHidden.value, partial: isPartial.value }),
);
const rootClass = computed(() => (props.state ? ui.value.root() : "contents"));
</script>

<template>
  <slot v-if="!props.state && !props.persistent" />
  <!-- The slot keeps the same place in the tree whatever the state: a change
       only restyles the wrapper and adds or drops the veil and badge. -->
  <div
    v-else
    :class="rootClass"
    :data-permission-veil="props.state || undefined"
  >
    <div
      :inert="isHidden || undefined"
      :aria-hidden="isHidden || undefined"
      class="contents"
    >
      <slot />
    </div>
    <div v-if="isHidden || isPartial" :class="ui.veil()" />
    <UTooltip v-if="props.state" :text="props.detail" :disabled="!props.detail">
      <span
        :class="ui.badge()"
        role="status"
        :tabindex="props.detail ? 0 : undefined"
      >
        <UIcon
          :name="isHidden || isPartial ? 'i-ph-lock-simple' : 'i-ph-eye'"
          :class="ui.icon()"
        />
        {{ props.label }}
      </span>
    </UTooltip>
  </div>
</template>
