<script setup lang="ts">
/**
 * Adds a button to the page header from the browser, next to the ones the
 * layout serves. Its `order` (20) puts it between the served Download (10)
 * and Publish (30) buttons.
 */
import { h, resolveComponent } from "vue";
import { usePageHeaderActions } from "#dms-layout/app/composables/layout/usePageHeaderActions";

const CLIENT_ACTION_ORDER = 20;

const toast = useToast();
const { t } = useI18n();

function onSelect() {
  toast.add({
    title: t("demo.pages.header.client_action_toast"),
    icon: "i-ph-cursor-click",
  });
}

usePageHeaderActions(
  () =>
    h(resolveComponent("UButton"), {
      label: t("demo.pages.header.client_action"),
      icon: "i-ph-browser",
      color: "neutral",
      variant: "outline",
      onClick: onSelect,
    }),
  { order: CLIENT_ACTION_ORDER },
);
</script>

<template>
  <UAlert
    icon="i-ph-browser"
    color="neutral"
    variant="subtle"
    :title="t('demo.pages.header.client_action_title')"
    :description="t('demo.pages.header.client_action_description')"
  />
</template>
