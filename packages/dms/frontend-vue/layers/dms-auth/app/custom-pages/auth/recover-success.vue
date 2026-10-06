<script setup lang="ts">
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";
</script>

<template>
  <StageCard
    icon="i-ph-check"
    tone="success"
    :title="$t('page.forgot.title_success')"
    :description="$t('page.forgot.description_success')"
  >
    <UButton
      :label="$t('page.forgot.sign_in_button')"
      trailing-icon="i-ph-arrow-right"
      :ui="{ trailingIcon: 'ms-0' }"
      to="/auth"
      size="lg"
      class="mt-[22px] justify-center"
      block
    />
  </StageCard>
</template>
