<script setup lang="ts">
/**
 * One side panel (see `useAppSidePanels`), fixed on the right of the window.
 * From `lg` it is docked: every dashboard frame keeps that width free on its
 * right, so the page shrinks next to it, and a resize handle sits on its inner
 * edge. Below `lg` the same element is a sheet over the page, above a
 * backdrop: the switch is CSS only, so crossing the breakpoint never remounts
 * the panel's component. An `overlay` panel is that sheet at every width: the
 * page behind keeps its width.
 */
import { useMediaQuery } from "@vueuse/core";
import type { SidePanel } from "../../../composables/useAppSidePanels";
import { useSidePanel } from "../../../composables/useSidePanel";
import {
  isFullSidePanel,
  sidePanelWidthStyle,
} from "../../composables/layout/sidePanelState";
import { useSidePanelWidth } from "../../composables/layout/useSidePanelWidth";

interface Props {
  panel: SidePanel;
}

const props = defineProps<Props>();

// The panel belongs to the dashboard: a page without its shell (onboarding,
// an error page) hides it, and keeps it mounted for the way back.
const HOST_CLASS =
  "contents [body:not(:has([data-dms-persistent-shell]))_&]:hidden";
const DESKTOP_QUERY = "(min-width: 1024px)";
const ESCAPE_KEY = "Escape";
const PANEL_DOM_ID_PREFIX = "dms-side-panel-";
const BACKDROP_CLASS = "bg-elevated/75 fixed inset-0 z-40";
// Docked from `lg`, where the frame makes room for it; a sheet below.
const DOCKED_BACKDROP_CLASS = "lg:hidden";
const DOCKED_PANEL_CLASS = "max-lg:z-50 max-lg:shadow-xl lg:max-w-[60vw]";
const OVERLAY_PANEL_CLASS = "z-50 shadow-xl";
// A sized panel fills a phone's screen; an unsized one keeps its width there.
const SIZED_PANEL_PHONE_CLASS = "max-sm:w-full";

const { t } = useI18n();
const { processI18n } = useTranslation();
const isDesktop = useMediaQuery(DESKTOP_QUERY);
const isOverlay = computed(() => props.panel.overlay === true);
// Docked, the panel is part of the page; a sheet covers it.
const isSheet = computed(() => isOverlay.value || !isDesktop.value);
const isFull = computed(() => isFullSidePanel(props.panel));
const { close } = useSidePanel(props.panel.id);
const panelEl = ref<HTMLElement | null>(null);
const {
  width,
  bounds,
  isDragging,
  startDrag,
  drag,
  endDrag,
  resizeFromKey,
  reset,
} = useSidePanelWidth(props.panel);

const panelDomId = `${PANEL_DOM_ID_PREFIX}${props.panel.id}`;
const ariaLabel = computed(() =>
  props.panel.ariaLabel ? processI18n(props.panel.ariaLabel) : undefined,
);
const panelStyle = computed(() =>
  sidePanelWidthStyle(width.value, isFull.value),
);
const backdropClass = computed(() =>
  isOverlay.value ? BACKDROP_CLASS : [BACKDROP_CLASS, DOCKED_BACKDROP_CLASS],
);
const panelClass = computed(() => [
  isOverlay.value ? OVERLAY_PANEL_CLASS : DOCKED_PANEL_CLASS,
  props.panel.size && SIZED_PANEL_PHONE_CLASS,
]);
const panelComponent = computed(
  () => resolveDmsComponent(props.panel.component) ?? props.panel.component,
);

// Escape dismisses the sheet only: docked, the panel is part of the page and
// its component may give the key a meaning of its own.
function closeSheetOnEscape(event: KeyboardEvent): void {
  if (event.key !== ESCAPE_KEY || !isSheet.value) return;
  close();
}

function startHandleDrag(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  const renderedWidth = panelEl.value?.getBoundingClientRect().width;
  startDrag(event, renderedWidth || width.value);
}

let focusBeforeOpen: HTMLElement | null = null;

function isFocusInside(): boolean {
  return panelEl.value?.contains(document.activeElement) ?? false;
}

// The sheet covers the page, so focus moves into it unless the panel's own
// component already took it; closing gives focus back to where it came from.
onMounted(() => {
  const active = document.activeElement;
  focusBeforeOpen = active instanceof HTMLElement ? active : null;
  if (!isSheet.value || isFocusInside()) return;
  panelEl.value?.focus();
});

onBeforeUnmount(() => {
  if (isFocusInside()) focusBeforeOpen?.focus();
});
</script>

<template>
  <div data-dms-side-panel-host :class="HOST_CLASS">
    <button
      type="button"
      aria-hidden="true"
      tabindex="-1"
      data-dms-side-panel-backdrop
      :class="backdropClass"
      @click="close"
    />

    <aside
      :id="panelDomId"
      ref="panelEl"
      data-dms-side-panel
      :data-dragging="isDragging || undefined"
      :data-overlay="isOverlay || undefined"
      :data-size="panel.size"
      :aria-label="ariaLabel"
      tabindex="-1"
      class="border-default fixed inset-y-0 end-0 flex w-(--dms-side-panel-width) max-w-full min-w-0 flex-col border-s bg-(--dms-bg-sidebar) outline-none"
      :class="panelClass"
      :style="panelStyle"
      @keydown="closeSheetOnEscape"
    >
      <div
        v-if="!isFull"
        role="separator"
        aria-orientation="vertical"
        tabindex="0"
        data-dms-side-panel-handle
        :aria-controls="panelDomId"
        :aria-label="t('side_panel.resize')"
        :aria-valuenow="width"
        :aria-valuemin="bounds.minWidth"
        :aria-valuemax="bounds.maxWidth"
        class="group/handle absolute inset-y-0 -start-1 z-10 hidden w-2 cursor-ew-resize touch-none outline-none select-none lg:block"
        @pointerdown="startHandleDrag"
        @pointermove="drag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @lostpointercapture="endDrag"
        @keydown="resizeFromKey"
        @dblclick="reset"
      >
        <span
          aria-hidden="true"
          class="group-hover/handle:bg-primary group-focus-visible/handle:bg-primary absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 transition-colors motion-reduce:transition-none"
          :class="{ 'bg-primary': isDragging }"
        />
      </div>

      <component :is="panelComponent" class="min-h-0 flex-1" />
    </aside>
  </div>
</template>
