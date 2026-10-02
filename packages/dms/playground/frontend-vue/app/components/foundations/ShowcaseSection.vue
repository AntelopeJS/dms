<script setup lang="ts">
/**
 * One component of a design-system showcase page: its name, what it is for,
 * then its labelled demos (ShowcaseDemo) in the default slot.
 */
interface Props {
  /** Component name, e.g. "DmsIconWell". */
  title: string;
  /** What the component is for and where the app uses it. */
  description?: string;
  /** Anchor id, so the section can be linked to. */
  id?: string;
  /** Columns of the demo grid from `lg` up. */
  columns?: 1 | 2 | 3;
}

const props = withDefaults(defineProps<Props>(), {
  description: undefined,
  id: undefined,
  columns: 2,
});

const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 lg:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
};
</script>

<template>
  <section :id="props.id" class="grid gap-5" style="scroll-margin-top: 80px">
    <DmsSectionHeader :title="props.title" :description="props.description" />
    <div class="grid gap-x-8 gap-y-8" :class="COLUMN_CLASSES[props.columns]">
      <slot />
    </div>
  </section>
</template>
