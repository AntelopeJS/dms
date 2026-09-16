<script setup lang="ts">
/**
 * Demo body for a framed app widget (see `useAppWidgets`). The DMS dock owns the
 * chip, opacity, positioning and animated frame — this component only fills the
 * unfolded card. A plain, non-interactive status card.
 */
</script>

<template>
  <div class="w-64 p-4">
    <p class="text-sm font-medium text-highlighted">
      {{ $t("demo.widgets.status.title") }}
    </p>
    <p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
      <UIcon name="i-ph-check-circle" class="size-3.5 text-success" />
      {{ $t("demo.widgets.status.ok") }}
    </p>
  </div>
</template>
