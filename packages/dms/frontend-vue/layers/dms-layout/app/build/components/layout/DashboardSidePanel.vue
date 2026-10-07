<script setup lang="ts">
/**
 * One side panel (see `useAppSidePanels`). From `lg` it is a flex item after
 * the page panel of the dashboard group, so the page shrinks to make room,
 * with a resize handle on its inner edge. Below `lg` the same element turns
 * into a sheet fixed over the right of the page, above a backdrop: the switch
 * is CSS only, so crossing the breakpoint never remounts the panel's component.
 */
import { useMediaQuery } from "@vueuse/core";
import type { SidePanel } from "../../../composables/useAppSidePanels";
import { useSidePanelWidth } from "../../composables/layout/useSidePanelWidth";

interface Props {
  panel: SidePanel;
}

const props = defineProps<Props>();

const DESKTOP_QUERY = "(min-width: 1024px)";
const ESCAPE_KEY = "Escape";
const WIDTH_VARIABLE = "--dms-side-panel-width";
const PANEL_DOM_ID_PREFIX = "dms-side-panel-";

const { t } = useI18n();
const { processI18n } = useTranslation();
const isDocked = useMediaQuery(DESKTOP_QUERY);
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
const panelStyle = computed(() => ({ [WIDTH_VARIABLE]: `${width.value}px` }));
const panelComponent = computed(
  () => resolveDmsComponent(props.panel.component) ?? props.panel.component,
);

function close(): void {
  props.panel.onClose?.();
}

// Escape dismisses the sheet only: docked, the panel is part of the page and
// its component may give the key a meaning of its own.
function closeSheetOnEscape(event: KeyboardEvent): void {
  if (event.key !== ESCAPE_KEY || isDocked.value) return;
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
  if (isDocked.value || isFocusInside()) return;
  panelEl.value?.focus();
});

onBeforeUnmount(() => {
  if (isFocusInside()) focusBeforeOpen?.focus();
});
</script>

<template>
  <button
    type="button"
    aria-hidden="true"
    tabindex="-1"
    data-dms-side-panel-backdrop
    class="bg-elevated/75 fixed inset-0 z-40 lg:hidden"
    @click="close"
  />

  <aside
    :id="panelDomId"
    ref="panelEl"
    data-dms-side-panel
    :data-dragging="isDragging || undefined"
    :aria-label="ariaLabel"
    tabindex="-1"
    class="max-lg:border-default flex w-(--dms-side-panel-width) min-w-0 shrink-0 flex-col bg-(--dms-bg-sidebar) outline-none max-lg:fixed max-lg:inset-y-0 max-lg:end-0 max-lg:z-50 max-lg:max-w-full max-lg:border-s max-lg:shadow-xl lg:relative lg:max-w-[60vw]"
    :style="panelStyle"
    @keydown="closeSheetOnEscape"
  >
    <div
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
</template>
