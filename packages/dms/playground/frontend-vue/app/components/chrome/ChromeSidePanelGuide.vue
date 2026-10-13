<script setup lang="ts">
import { SIDE_PANEL_DEMO_ID } from "../../composables/useSidePanelDemo";
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Side panel: the panel the playground
 * docks with `registerSidePanel`, opened from code through `useSidePanel`,
 * and every panel the dashboard knows through `useAppSidePanels`.
 */

const CONTROLS_CODE = `const panel = useSidePanel("${SIDE_PANEL_DEMO_ID}");
panel.open(); panel.close(); panel.toggle();
panel.isOpen.value; // shared by every caller of the same id`;

const panel = useSidePanel(SIDE_PANEL_DEMO_ID);
const { panels } = useAppSidePanels();

const panelItems = computed(() =>
  panels.value.map((entry) => {
    const bounds = resolveSidePanelWidthBounds(entry);
    return {
      label: entry.id,
      value: `${bounds.defaultWidth}px, ${bounds.minWidth}–${bounds.maxWidth}px`,
      detail: entry.component,
    };
  }),
);
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="open-from-code"
      title="Open it from code"
      description="The DMS owns the open state: one panel is open at a time, a cookie remembers it, so the server renders it open on the next visit. The header button (its header action carries sidePanelId) and these buttons drive the same state."
    >
      <ShowcaseDemo label="useSidePanel(id)" :code="CONTROLS_CODE">
        <div class="flex flex-wrap items-center gap-2">
          <DmsStatusPill
            :tone="panel.isOpen.value ? 'success' : 'neutral'"
            :label="panel.isOpen.value ? 'Open' : 'Closed'"
            dot="static"
          />
          <UButton
            label="Open"
            icon="i-ph-sidebar-simple"
            size="sm"
            @click="panel.open"
          />
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            size="sm"
            @click="panel.close"
          />
          <UButton
            label="Toggle"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="panel.toggle"
          />
        </div>
      </ShowcaseDemo>
      <ShowcaseDemo
        label="useAppSidePanels().panels · resolveSidePanelWidthBounds"
      >
        <DmsCard title="Registered panels" :count="panelItems.length">
          <DmsKeyValueList :items="panelItems" dense />
        </DmsCard>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="what-to-try"
      title="What to try"
      description="Open the panel, type a draft in it, then open another page of the library: the panel follows without remounting, so the draft and its mount time stay. Drag its left edge: the width stays between minWidth and maxWidth. Below the lg breakpoint it slides over the page instead."
      :columns="1"
    >
      <ShowcaseDemo
        label="registerSidePanel + registerHeaderAction({ sidePanelId })"
        wide
      >
        <SourceSnippet path="plugins/side-panel-demo.ts" />
      </ShowcaseDemo>
      <ShowcaseDemo
        label="The id the panel, its header action and its body share"
        wide
      >
        <SourceSnippet path="composables/useSidePanelDemo.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
