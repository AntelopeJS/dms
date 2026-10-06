<script setup lang="ts">
import { useAppearanceSave } from "./useAppearanceSave";

const { t } = useI18n();
const { preferences, pick } = useAppearanceSave();
</script>

<template>
  <DmsFieldRow
    label="$page.settings.appearance.sidebar_start_collapsed"
    description="$page.settings.appearance.sidebar_start_collapsed_hint"
  >
    <USwitch
      :model-value="preferences.sidebarStartCollapsed.value"
      @update:model-value="pick('sidebarStartCollapsed', $event)"
      :aria-label="t('page.settings.appearance.sidebar_start_collapsed')"
    />
  </DmsFieldRow>
</template>
