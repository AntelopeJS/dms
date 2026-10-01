<script setup lang="ts">
import Container from "../build/components/layout/Container.vue";
import PageHeader from "../build/components/layout/PageHeader.vue";
import DashboardSidebar from "../build/components/layout/DashboardSidebar.vue";
import DashboardHeader from "../build/components/layout/DashboardHeader.vue";
import DashboardBanners from "../build/components/layout/DashboardBanners.vue";
import RolePreviewBar from "../build/components/layout/RolePreviewBar.vue";
import PageHeaderActionBar, {
  type LayoutHeaderAction,
} from "../build/components/layout/PageHeaderActionBar.vue";
import SettingsShell from "../build/components/pages/settings/shell/SettingsShell.vue";
import { isSettingsFullId } from "../composables/settings/useSettingsNavigation";
import { providePageHeaderActions } from "../composables/layout/usePageHeaderActions";

// Sidebar sizes are in px (the v2 240px sidebar). The storage key changed with
// the unit, so a width saved in % is not read back as px.
const DASHBOARD_STORAGE_KEY = "dms-dashboard";
const DASHBOARD_SIZE_UNIT = "px";

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

providePageFillHeight(toRef(props, "fillHeight"));

const regionClass = computed(() =>
  props.fillHeight ? PAGE_FILL_HEIGHT_CLASSES.region : undefined,
);

// Every settings page — core, module or project — gets the settings shell:
// the page is identified by the site layout, not by its layout options, so
// no page has to opt in.
const siteLayout = useSiteLayout();
const route = useDmsRoute();
const isSettingsPage = computed(() =>
  isSettingsFullId(
    siteLayout.findMatchingRouteOrCategory(route.path)?.metadata.fullId,
  ),
);

const pageHeaderActions = providePageHeaderActions();
const hasHeaderActions = computed(
  () => !!pageHeaderActions.value || props.headerActions.length > 0,
);
</script>

<template>
  <UDashboardGroup
    data-dms-persistent-shell
    :storage-key="DASHBOARD_STORAGE_KEY"
    :unit="DASHBOARD_SIZE_UNIT"
  >
    <DashboardSidebar />

    <UDashboardPanel>
      <template #header>
        <DashboardHeader />
        <DashboardBanners />
        <RolePreviewBar />
      </template>

      <template #body>
        <Container
          data-dms-page-region
          data-dms-page-content
          :full-width="props.fullWidth"
          :class="regionClass"
        >
          <SettingsShell v-if="isSettingsPage">
            <PageHeader
              v-if="props.title && !props.hideHeader"
              :icon="props.icon || 'i-ph-file'"
              :title="props.title"
              :description="props.description"
              class="pb-5"
            >
              <template v-if="hasHeaderActions" #actions>
                <div class="ms-auto flex flex-wrap items-center gap-2">
                  <PageHeaderActionBar :actions="props.headerActions" />
                  <component :is="pageHeaderActions" v-if="pageHeaderActions" />
                </div>
              </template>
            </PageHeader>
            <slot />
          </SettingsShell>
          <template v-else>
            <PageHeader
              v-if="props.title && !props.hideHeader"
              :icon="props.icon || 'i-ph-file'"
              :title="props.title"
              :description="props.description"
              class="pb-6"
            >
              <template v-if="hasHeaderActions" #actions>
                <div class="ms-auto flex flex-wrap items-center gap-2">
                  <PageHeaderActionBar :actions="props.headerActions" />
                  <component :is="pageHeaderActions" v-if="pageHeaderActions" />
                </div>
              </template>
            </PageHeader>
            <slot />
          </template>
        </Container>
      </template>

      <template #footer>
        <DmsAppWidgetsDock />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
