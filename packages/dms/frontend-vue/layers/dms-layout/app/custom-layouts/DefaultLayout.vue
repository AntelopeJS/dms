<script setup lang="ts">
import DashboardFrame from "../build/components/layout/DashboardFrame.vue";
import DashboardPageBody from "../build/components/layout/DashboardPageBody.vue";
import type { LayoutHeaderAction } from "../build/components/layout/PageHeaderActionBar.vue";

interface Props {
  fullWidth?: boolean;
  hideHeader?: boolean;
  fillHeight?: boolean;
  icon?: string;
  title?: string;
  description?: string;
  /** Header buttons declared by the backend page (`headerActions`). */
  headerActions?: LayoutHeaderAction[];
}

const props = withDefaults(defineProps<Props>(), {
  fullWidth: true,
  hideHeader: false,
  fillHeight: false,
  icon: "i-ph-file",
  title: undefined,
  description: undefined,
  headerActions: () => [],
});
</script>

<template>
  <DashboardFrame :full-width="props.fullWidth" :fill-height="props.fillHeight">
    <DashboardPageBody
      :hide-header="props.hideHeader"
      :icon="props.icon"
      :title="props.title"
      :description="props.description"
      :header-actions="props.headerActions"
    >
      <slot />
    </DashboardPageBody>
  </DashboardFrame>
</template>
