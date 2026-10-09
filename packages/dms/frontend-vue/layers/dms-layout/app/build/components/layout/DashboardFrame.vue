<script setup lang="ts">
import Container from "./Container.vue";
import DashboardSidebar from "./DashboardSidebar.vue";
import DashboardHeader from "./DashboardHeader.vue";
import DashboardBanners from "./DashboardBanners.vue";
import GithubStarPrompt from "./GithubStarPrompt.vue";
import RolePreviewBar from "./RolePreviewBar.vue";
import { useAppWidgets } from "../../../composables/useAppWidgets";
import {
  sidePanelWidthStyle,
  useActiveSidePanel,
} from "../../composables/layout/sidePanelState";

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
// The open side panel is rendered once for the app (`SidePanelHost`), fixed on
// the right; from `lg` the frame keeps its width free so the page shrinks.
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

const { panel: sidePanel, width: sidePanelWidth } = useActiveSidePanel();
// Bound as attributes so a frame without a panel renders no empty `style`.
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
