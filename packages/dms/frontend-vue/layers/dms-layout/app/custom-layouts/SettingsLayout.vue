<script setup lang="ts">
import DashboardFrame from "../build/components/layout/DashboardFrame.vue";
import DashboardPageBody from "../build/components/layout/DashboardPageBody.vue";
import type { LayoutHeaderAction } from "../build/components/layout/PageHeaderActionBar.vue";
import type { PageHeaderSource } from "#dms-ui/app/types/page-header";
import SettingsShell from "../build/components/pages/settings/shell/SettingsShell.vue";

interface Props {
  hideHeader?: boolean;
  fillHeight?: boolean;
  icon?: string;
  title?: string;
  description?: string;
  /** Header buttons declared by the backend page (`headerActions`). */
  headerActions?: LayoutHeaderAction[];
  /** The record the header shows, read from its route (`header`). */
  header?: PageHeaderSource;
}

const props = withDefaults(defineProps<Props>(), {
  hideHeader: false,
  fillHeight: false,
  icon: "i-ph-file",
  title: undefined,
  description: undefined,
  headerActions: () => [],
  header: undefined,
});
</script>

<template>
  <DashboardFrame :full-width="false" :fill-height="props.fillHeight">
    <SettingsShell>
      <DashboardPageBody
        :hide-header="props.hideHeader"
        :icon="props.icon"
        :title="props.title"
        :description="props.description"
        :header-actions="props.headerActions"
        :header="props.header"
        header-class="pb-5"
      >
        <slot />
      </DashboardPageBody>
    </SettingsShell>
  </DashboardFrame>
</template>
