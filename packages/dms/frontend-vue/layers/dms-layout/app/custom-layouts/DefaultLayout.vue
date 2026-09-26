<script setup lang="ts">
import Container from "../build/components/layout/Container.vue";
import PageHeader from "../build/components/layout/PageHeader.vue";
import DashboardSidebar from "../build/components/layout/DashboardSidebar.vue";
import DashboardHeader from "../build/components/layout/DashboardHeader.vue";
import DashboardBanners from "../build/components/layout/DashboardBanners.vue";

interface Props {
  fullWidth?: boolean;
  hideHeader?: boolean;
  icon?: string;
  title?: string;
  description?: string;
}

const props = withDefaults(defineProps<Props>(), {
  fullWidth: true,
  hideHeader: false,
  icon: "i-ph-file",
  title: undefined,
  description: undefined,
});
</script>

<template>
  <UDashboardGroup data-dms-persistent-shell>
    <DashboardSidebar />

    <UDashboardPanel>
      <template #header>
        <DashboardHeader />
        <DashboardBanners />
      </template>

      <template #body>
        <Container
          data-dms-page-region
          data-dms-page-content
          :full-width="props.fullWidth"
        >
          <PageHeader
            v-if="props.title && !props.hideHeader"
            :icon="props.icon || 'i-ph-file'"
            :title="props.title"
            :description="props.description"
            class="pt-6 pb-7"
          />
          <slot />
        </Container>
      </template>

      <template #footer>
        <DmsAppWidgetsDock />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
