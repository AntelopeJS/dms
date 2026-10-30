<script setup lang="ts">
import { useConfirm } from "#dms-ui/app/composables/confirm";
import { resetDevicePreferences } from "../../../../utils/devicePreferences";

const { t } = useI18n();
const { confirm } = useConfirm();

async function reset(): Promise<void> {
  const isConfirmed = await confirm({
    title: t("page.settings.appearance.reset.confirm_title"),
    description: t("page.settings.appearance.reset.confirm_description"),
    icon: "i-ph-arrow-counter-clockwise",
    color: "error",
    confirmIcon: "i-ph-arrow-counter-clockwise",
    confirmLabel: t("page.settings.appearance.reset.confirm"),
    cancelLabel: t("page.settings.appearance.reset.cancel"),
    initialFocus: "cancel",
  });
  if (!isConfirmed) return;
  resetDevicePreferences();
  window.location.reload();
}
</script>

<template>
  <DmsFieldRow
    label="$page.settings.appearance.reset.label"
    description="$page.settings.appearance.reset.hint"
  >
    <UButton
      color="error"
      variant="outline"
      icon="i-ph-arrow-counter-clockwise"
      :label="t('page.settings.appearance.reset.button')"
      data-appearance-reset
      @click="reset"
    />
  </DmsFieldRow>
</template>
