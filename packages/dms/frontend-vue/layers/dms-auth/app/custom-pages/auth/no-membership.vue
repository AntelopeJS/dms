<script setup lang="ts">
import StageCard from "#dms-layout/app/entries/components/layout/StageCard";
</script>

<template>
  <StageCard
    icon="i-ph-buildings"
    tone="warning"
    :title="$t('page.no_membership.title')"
    :description="$t('page.no_membership.description')"
  >
    <UButton
      :label="$t('page.no_membership.sign_in_button')"
      trailing-icon="i-ph-arrow-right"
      :ui="{ trailingIcon: 'ms-0' }"
      to="/auth"
      size="lg"
      class="mt-[22px] justify-center"
      block
    />
  </StageCard>
</template>
