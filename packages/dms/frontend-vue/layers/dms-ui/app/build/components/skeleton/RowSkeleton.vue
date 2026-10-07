<script setup lang="ts">
// The placeholder of a list row while it loads: an icon well and a few text
// lines, each sized like the row it stands for so nothing moves once the
// rows arrive. The padding is the caller's (`class`).

interface RowSkeletonProps {
  /** Classes of the icon well: its size and radius. */
  well: string;
  /** Classes of each text line: its height, width and margins. */
  lines: readonly string[];
  /** Classes of the column of lines: their spacing. */
  linesClass?: string;
  /** Centres the well on the lines rather than on the first one. */
  isCentered?: boolean;
}

const props = withDefaults(defineProps<RowSkeletonProps>(), {
  linesClass: "space-y-1.5",
  isCentered: false,
});
</script>

<template>
  <div
    class="flex gap-3"
    :class="props.isCentered ? 'items-center' : 'items-start'"
    aria-hidden="true"
  >
    <USkeleton class="shrink-0" :class="props.well" />
    <div class="min-w-0 flex-1" :class="props.linesClass">
      <USkeleton
        v-for="(line, index) in props.lines"
        :key="index"
        :class="line"
      />
    </div>
  </div>
</template>
