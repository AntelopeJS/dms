<script setup lang="ts">
import { useAccountData } from "../../../../composables/settings/profile/useAccountData";

const { t } = useI18n();
const { isExporting, isCheckingDeletion, exportData, deleteAccount } =
  useAccountData();
</script>

<template>
  <div>
    <DmsFieldRow
      label="$page.settings.profile.data.export_title"
      description="$page.settings.profile.data.export_description"
    >
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-ph-download-simple"
        :loading="isExporting"
        :label="t('page.settings.profile.data.export_button')"
        @click="exportData"
      />
    </DmsFieldRow>
    <DmsFieldRow
      label="$page.settings.profile.data.delete_title"
      description="$page.settings.profile.data.delete_description"
    >
      <UButton
        color="error"
        variant="outline"
        size="sm"
        icon="i-ph-trash"
        :loading="isCheckingDeletion"
        :label="t('page.settings.profile.data.delete_button')"
        @click="deleteAccount"
      />
    </DmsFieldRow>
  </div>
</template>
