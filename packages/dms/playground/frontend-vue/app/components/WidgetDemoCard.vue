<script setup lang="ts">
/**
 * Demo body for a framed app widget (see `useAppWidgets`). Shows that rich,
 * interactive content works through the hover bridge: the counter stays usable
 * once the pointer moves from the chip into the unfolded card.
 */
const count = ref(0);
</script>

<template>
  <div class="w-64 p-4">
    <p class="text-sm font-medium text-highlighted">
      {{ $t("demo.widgets.actions.title") }}
    </p>
    <p class="mt-1 text-xs text-muted">
      {{ $t("demo.widgets.actions.description") }}
    </p>
    <UButton class="mt-3" size="sm" icon="i-ph-plus" @click="count++">
      {{ $t("demo.widgets.actions.clicked", { count }) }}
    </UButton>
  </div>
</template>
