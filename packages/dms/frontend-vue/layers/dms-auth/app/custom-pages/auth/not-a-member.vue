<script setup lang="ts">
import StageCard from "#dms-layout/app/entries/components/layout/StageCard";
</script>

<template>
  <StageCard
    icon="i-ph-buildings"
    tone="neutral"
    :title="$t('page.no_workspace.title')"
    :description="$t('page.no_workspace.description')"
  >
    <UButton
      :label="$t('page.no_workspace.back_to_sign_in')"
      leading-icon="i-ph-arrow-left"
      to="/auth"
      size="lg"
      class="mt-[22px] justify-center"
      block
    />
  </StageCard>
</template>
