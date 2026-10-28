<script setup lang="ts">
import Container from "./Container.vue";
import DashboardSidebar from "./DashboardSidebar.vue";
import DashboardHeader from "./DashboardHeader.vue";
import DashboardBanners from "./DashboardBanners.vue";
import GithubStarPrompt from "./GithubStarPrompt.vue";
import RolePreviewBar from "./RolePreviewBar.vue";
import { useAppWidgets } from "../../../composables/useAppWidgets";
import { useVisitNavBadges } from "../../composables/navigation/useVisitNavBadges";
import {
  sidePanelWidthStyle,
  useActiveSidePanel,
} from "#dms-ui/app/entries/composables/layout/sidePanelState";
import { DASHBOARD_STORAGE_KEY } from "../../utils/dashboardStorage";

const DASHBOARD_SIZE_UNIT = "px";

const REGION_PADDING_CLASS = "pb-12 lg:pb-16";

const DOCK_CLEARANCE_CLASS =
  "pb-12 sm:pb-[max(3rem,var(--dms-dock-clearance-folded,0px))] lg:pb-[max(4rem,var(--dms-dock-clearance-folded,0px))] xl:pb-[max(4rem,var(--dms-dock-clearance,0px))]";

const DOCK_CHIP_REM = 3;
const DOCK_EDGE_REM = 1.375;

const SIDE_PANEL_ROOM_CLASS = "lg:end-[min(var(--dms-side-panel-width),60vw)]";
const dockHeight = (chips: number): string =>
  `${chips * DOCK_CHIP_REM + DOCK_EDGE_REM}rem`;

interface Props {
  fullWidth?: boolean;
  fillHeight?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  fullWidth: true,
  fillHeight: false,
});

providePageFillHeight(toRef(props, "fillHeight"));

useRenderedSiteLayout();

useRenderedBellCounts();

useVisitNavBadges();

const { widgets: appWidgets } = useAppWidgets();

const hasDockClearance = computed(
  () => appWidgets.value.length > 0 && !props.fillHeight,
);
const regionClass = computed(() => {
  if (props.fillHeight) {
    return [PAGE_FILL_HEIGHT_CLASSES.region, REGION_PADDING_CLASS];
  }
  return hasDockClearance.value ? DOCK_CLEARANCE_CLASS : REGION_PADDING_CLASS;
});

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

const { panel: sidePanel, width: sidePanelWidth } = useActiveSidePanel();

const groupAttrs = computed(() =>
  sidePanel.value
    ? {
        class: SIDE_PANEL_ROOM_CLASS,
        style: sidePanelWidthStyle(sidePanelWidth.value),
      }
    : {},
);
</script>

<template>
  <UDashboardGroup
    data-dms-persistent-shell
    :storage-key="DASHBOARD_STORAGE_KEY"
    :unit="DASHBOARD_SIZE_UNIT"
    v-bind="groupAttrs"
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
          <slot />
        </Container>
      </template>

      <template #footer>
        <DmsAppWidgetsDock />
      </template>
    </UDashboardPanel>

    <GithubStarPrompt />
  </UDashboardGroup>
</template>
