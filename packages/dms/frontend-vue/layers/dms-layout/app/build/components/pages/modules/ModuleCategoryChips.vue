<script setup lang="ts">
// v2 .mc-cat: a radio group of pill chips with a mono count.
import type { ModuleCategoryOption } from "../../../../utils/modules-catalog";

interface ModuleCategoryChipsProps {
  /** The categories to pick from, each with its module count. */
  options: readonly ModuleCategoryOption[];
  /** Accessible name of the group; "Category" by default. */
  label?: string;
}

const props = withDefaults(defineProps<ModuleCategoryChipsProps>(), {
  label: undefined,
});
/** Value of the picked category. */
const category = defineModel<string>({ required: true });
const { t } = useI18n();
</script>

<template>
  <div
    class="flex flex-wrap gap-1.5"
    role="radiogroup"
    :aria-label="props.label ?? t('modules.category.label')"
  >
    <button
      v-for="option in props.options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="category === option.value"
      class="focus-visible:outline-primary inline-flex h-7 items-center gap-1.5 rounded-full border px-[11px] text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      :class="
        category === option.value
          ? 'border-primary bg-primary text-inverted font-semibold'
          : 'text-muted hover:bg-elevated hover:text-highlighted border-(--ui-border-accented) font-medium'
      "
      @click="category = option.value"
    >
      {{ option.label }}
      <span
        class="font-mono text-[10.5px]"
        :class="category === option.value ? 'opacity-70' : 'text-dimmed'"
      >
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
