<script setup lang="ts">
import { computed } from "vue";
import { SOFT_TINT, type SemanticColor } from "../../utils/semanticTint";

// DMS activity / feed / history row (design .feed-row + .watch-row): an
// optional tinted icon bubble, a title (+ optional subtitle) and trailing meta.
// Compose a divided list of these for "Recent requests", "Recent queries",
// activity feeds, history panels… The title/subtitle/trailing accept slots so
// callers can inline badges or rich markup.
const props = withDefaults(
  defineProps<{
    icon?: string;
    iconColor?: SemanticColor;
    title?: string;
    subtitle?: string;
    trailing?: string;
    /** Render title/subtitle in mono (for paths, queries…). */
    mono?: boolean;
  }>(),
  {
    iconColor: "neutral",
    mono: false,
  },
);

const bubbleClass = computed(() => SOFT_TINT[props.iconColor]);
</script>

<template>
  <div
    class="hover:bg-elevated/40 flex items-center gap-3 px-4 py-3 transition-colors"
  >
    <div
      v-if="icon"
      :class="bubbleClass"
      class="grid size-[26px] shrink-0 place-items-center rounded-full"
    >
      <UIcon :name="icon" class="size-3.5" aria-hidden="true" />
    </div>

    <div class="min-w-0 flex-1">
      <div
        :class="mono ? 'font-mono text-[12.5px]' : 'text-[13px]'"
        class="text-toned flex items-center gap-2 truncate"
      >
        <slot>{{ title }}</slot>
      </div>
      <div
        v-if="subtitle || $slots.subtitle"
        :class="mono ? 'font-mono' : ''"
        class="text-dimmed mt-1 truncate text-[11px]"
      >
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>

    <div
      v-if="trailing || $slots.trailing"
      class="text-dimmed shrink-0 text-right font-mono text-[11px]"
    >
      <slot name="trailing">{{ trailing }}</slot>
    </div>
  </div>
</template>
