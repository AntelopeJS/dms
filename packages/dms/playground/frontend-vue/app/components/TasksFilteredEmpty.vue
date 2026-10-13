<script setup lang="ts">
// The filtered empty state of the "URL query filters" demo, drawn by a
// component (`emptyStates.filtered.component`): it reads the table's search
// and filters with `useTableViewEmptyState()` and offers its own ways out.
// A filter the page URL applies is not the table's to clear: the link back
// to the unfiltered page clears it.

const PAGE_PATH = "/table-view/table-view-query-filters";

const {
  search,
  canClearSearch,
  canClearFilters,
  clearSearch,
  clearFilters,
  refresh,
} = useTableViewEmptyState();
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-10 text-center">
    <UIcon name="i-ph-funnel-x" class="text-dimmed size-8" />
    <p class="text-highlighted font-semibold">No task matches</p>
    <p class="text-muted max-w-md text-sm">
      <template v-if="search">Nothing contains “{{ search }}”. </template>
      The page URL may filter the rows too: drop its filter chip, or open the
      page without it.
    </p>
    <div class="flex flex-wrap justify-center gap-2">
      <UButton
        v-if="canClearSearch"
        label="Clear search"
        color="neutral"
        variant="outline"
        @click="clearSearch()"
      />
      <UButton
        v-if="canClearFilters"
        label="Clear filters"
        color="neutral"
        variant="outline"
        @click="clearFilters()"
      />
      <UButton
        label="Reload"
        icon="i-ph-arrow-clockwise"
        color="neutral"
        variant="ghost"
        @click="refresh()"
      />
      <UButton label="All tasks" :to="PAGE_PATH" />
    </div>
  </div>
</template>
