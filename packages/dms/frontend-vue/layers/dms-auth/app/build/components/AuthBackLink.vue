<script setup lang="ts">
import type { RouteLocationRaw } from "#dms/frontend-module";

interface AuthBackLinkProps {
  to: RouteLocationRaw;
  label: string;
}

const props = defineProps<AuthBackLinkProps>();
</script>

<template>
  <!-- v2 .au-back: the quiet way out, under the card content. -->
  <DmsLink
    :to="props.to"
    class="text-muted hover:text-highlighted mt-3.5 flex items-center justify-center gap-1.5 text-[13px] transition-colors max-sm:min-h-8"
  >
    <UIcon name="i-ph-arrow-left" class="size-3.5" />
    {{ props.label }}
  </DmsLink>
</template>
