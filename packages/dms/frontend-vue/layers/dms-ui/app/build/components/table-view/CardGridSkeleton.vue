<script setup lang="ts">
/**
 * Placeholder of a table view card grid while its first page loads: cards
 * built like the cards display's (same frame, same line boxes), so nothing
 * moves when the real ones land.
 */
interface CardGridSkeletonProps {
  /** Cards drawn: the rows the page will list (capped). */
  count: number;
  /** Fields in each card's grid. */
  fields: number;
  /** Size classes of a field label, to match the real card's line box. */
  labelClass?: string;
}

const props = withDefaults(defineProps<CardGridSkeletonProps>(), {
  labelClass: "text-[10.5px] leading-[1.2]",
});

const MAX_CARD_COUNT = 12;
const cardCount = computed(() =>
  Math.max(1, Math.min(props.count, MAX_CARD_COUNT)),
);
</script>

<template>
  <div
    aria-hidden="true"
    class="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
  >
    <div
      v-for="n in cardCount"
      :key="n"
      class="border-default @container rounded-[10px] border bg-(--ui-bg) p-3.5 text-[12.5px]"
    >
      <div class="flex items-center gap-2.5">
        <USkeleton class="size-7 shrink-0 rounded-[7px]" />
        <div class="min-w-0 flex-1">
          <div class="text-[13px]">
            <USkeleton class="inline-block h-3 w-3/5 align-middle" />
          </div>
          <div class="font-mono text-[11px]">
            <USkeleton class="inline-block h-2 w-2/5 align-middle" />
          </div>
        </div>
      </div>
      <div
        class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 max-sm:@max-[16rem]:grid-cols-1"
      >
        <div v-for="field in props.fields" :key="field" class="min-w-0">
          <div :class="['font-mono', props.labelClass]">
            <USkeleton class="inline-block h-2 w-1/2 align-middle" />
          </div>
          <div class="mt-0.5">
            <USkeleton class="inline-block h-2.5 w-4/5 align-middle" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
