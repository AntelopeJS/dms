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
import { useAppWidgets } from "../composables/useAppWidgets";

// Sidebar sizes are in px (the v2 240px sidebar). The storage key changed with
// the unit, so a width saved in % is not read back as px.
const DASHBOARD_STORAGE_KEY = "dms-dashboard";
const DASHBOARD_SIZE_UNIT = "px";
// The v2 page bottom padding (48px, 64px from `lg`) sits on the page region,
// not on the panel body: the scroll area's own padding would lift every
// sticky footer (save bars) that far off the bottom of the screen.
const REGION_PADDING_CLASS = "pb-12 lg:pb-16";
// The widgets dock (shown from `sm`, folded behind one launcher chip below
// `xl`) floats over the bottom-left corner of the body. The region's bottom
// padding grows to the height the dock shows, so the end of a page can always
// scroll out from under the chips.
const DOCK_CLEARANCE_CLASS =
  "pb-12 sm:pb-[max(3rem,var(--dms-dock-clearance-folded,0px))] lg:pb-[max(4rem,var(--dms-dock-clearance-folded,0px))] xl:pb-[max(4rem,var(--dms-dock-clearance,0px))]";
// One 40px chip plus its 8px gap per widget, the 10px inset and a 12px margin.
const DOCK_CHIP_REM = 3;
const DOCK_EDGE_REM = 1.375;
const dockHeight = (chips: number): string =>
  `${chips * DOCK_CHIP_REM + DOCK_EDGE_REM}rem`;

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

const { widgets: appWidgets } = useAppWidgets();
// A fill-height page has nothing to scroll past the dock: no clearance.
const hasDockClearance = computed(
  () => appWidgets.value.length > 0 && !props.fillHeight,
);
const regionClass = computed(() => {
  if (props.fillHeight) {
    return [PAGE_FILL_HEIGHT_CLASSES.region, REGION_PADDING_CLASS];
  }
  return hasDockClearance.value ? DOCK_CLEARANCE_CLASS : REGION_PADDING_CLASS;
});
// Bound as attributes so a page without widgets renders no empty `style`.
const regionAttrs = computed(() =>
  hasDockClearance.value
    ? {
        style: {
          "--dms-dock-clearance": dockHeight(appWidgets.value.length),
          "--dms-dock-clearance-folded": dockHeight(1),
        },
      }
    : {},
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
          v-bind="regionAttrs"
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
                <div
                  class="flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto"
                >
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
                <div
                  class="flex w-full flex-wrap items-center gap-2 md:ms-auto md:w-auto"
                >
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
