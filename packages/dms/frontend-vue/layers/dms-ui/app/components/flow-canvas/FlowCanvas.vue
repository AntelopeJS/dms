<script setup lang="ts">
import { Background } from "@vue-flow/background";
import { ControlButton, Controls } from "@vue-flow/controls";
import { Panel, PanelPosition, useVueFlow, VueFlow } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import type { Component } from "vue";
import { computed, useId, useSlots } from "vue";

const DMS_GRID_GAP = 24;
const DMS_GRID_DOT_SIZE = 1.2;
const DMS_GRID_COLOR = "rgba(127, 140, 170, 0.25)";

const ZOOM_RESET_LEVEL = 1;
const ZOOM_TRANSITION_MS = 200;
const DEFAULT_DELETE_KEYS: readonly string[] = ["Delete", "Backspace"];
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const PANEL_POSITIONS: readonly PanelPosition[] = [
  PanelPosition.TopLeft,
  PanelPosition.TopCenter,
  PanelPosition.TopRight,
  PanelPosition.BottomLeft,
  PanelPosition.BottomCenter,
  PanelPosition.BottomRight,
];

type GridVariant = "dots" | "lines";
type DeleteKeyCode = string | string[] | null;

interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Consumer node renderers own this unparsed payload; VueFlow's generic data owner has no shared schema and its default any would weaken this object contract.
  data?: Record<string, unknown>;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Consumers forward arbitrary node extensions; VueFlow's closed Node fields would exclude existing extension keys.
  [key: string]: unknown;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Consumers forward arbitrary edge extensions; VueFlow's closed Edge fields would exclude existing extension keys.
  [key: string]: unknown;
}

interface DeleteAffordance {
  id: string;
  x: number;
  y: number;
}

interface Props {
  /** Flow nodes (forwarded to VueFlow; kept in sync by its store). */
  nodes?: FlowNode[];
  /** Flow edges. */
  edges?: FlowEdge[];
  /** Map of `type` → node renderer component (consumer-owned, business). */
  nodeTypes?: Record<string, Component>;
  /** Map of `type` → edge renderer component (consumer-owned). */
  edgeTypes?: Record<string, Component>;
  /** Background pattern, or `false` to hide it. */
  grid?: GridVariant | false;
  /** Gap between background dots/lines (px). */
  gridGap?: number;
  /** Background dot/line size (px). */
  gridSize?: number;
  /** Background pattern color. */
  gridColor?: string;
  /** Show the DMS zoom/fit control bar. */
  controls?: boolean;
  /** Show the overview minimap. */
  minimap?: boolean;
  /** Fit all nodes into view on first render. */
  fitViewOnInit?: boolean;
  /** Height of the canvas container (CSS length). */
  height?: string;
  /**
   * Surface a themed delete badge on selected nodes and route Delete/Backspace
   * through the `delete-nodes` event. The consumer stays in charge of the
   * actual removal. Off by default for backwards compatibility.
   */
  deletableNodes?: boolean;
  /**
   * Key(s) that trigger `delete-nodes` while `deletableNodes` is on. Pass
   * `null` to disable the keyboard path (badge only). Defaults to
   * Delete + Backspace.
   */
  deleteKeyCode?: DeleteKeyCode;
  /**
   * Draw the delete badge on selected nodes while `deletableNodes` is on.
   * `false` leaves the keyboard path alone. Defaults to `true`.
   */
  deleteBadge?: boolean;
  /**
   * Add a live zoom percentage / reset-to-100% control to the control bar.
   * It renders inside the bar, so it requires `controls` to be enabled.
   */
  zoomReadout?: boolean;
}

/** Undeclared VueFlow props and events pass through `$attrs`. */
const props = withDefaults(defineProps<Props>(), {
  nodes: () => [],
  edges: () => [],
  nodeTypes: undefined,
  edgeTypes: undefined,
  grid: "dots",
  gridGap: DMS_GRID_GAP,
  gridSize: DMS_GRID_DOT_SIZE,
  gridColor: DMS_GRID_COLOR,
  controls: true,
  minimap: false,
  fitViewOnInit: true,
  height: "100%",
  deletableNodes: false,
  deleteKeyCode: undefined,
  deleteBadge: true,
  zoomReadout: false,
});

const emit = defineEmits<{
  /** Deletion intent only. The consumer removes nodes and edges. */
  "delete-nodes": [ids: string[]];
}>();

defineOptions({ inheritAttrs: false });

const flowId = useId();
const flow = useVueFlow(flowId);

const slots = useSlots();

const isPanelSlot = (name: string): name is PanelPosition =>
  PANEL_POSITIONS.some((position) => position === name);

const activePanelPositions = computed(() =>
  PANEL_POSITIONS.filter((position) => slots[position]),
);

const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter((name) => name !== "default" && !isPanelSlot(name)),
);

const deleteKeys = computed<Set<string>>(() => {
  if (!props.deletableNodes) return new Set();
  const code =
    props.deleteKeyCode === undefined
      ? DEFAULT_DELETE_KEYS
      : props.deleteKeyCode;
  if (code === null) return new Set();
  return new Set(Array.isArray(code) ? code : [code]);
});

const resolvedDeleteKeyCode = computed<DeleteKeyCode | undefined>(() =>
  props.deletableNodes ? null : undefined,
);

const zoomPercent = computed(() =>
  Math.round((flow.viewport.value?.zoom ?? ZOOM_RESET_LEVEL) * 100),
);

const deleteAffordances = computed<DeleteAffordance[]>(() => {
  if (!props.deletableNodes || !props.deleteBadge) return [];
  const {
    x: panX,
    y: panY,
    zoom,
  } = flow.viewport.value ?? {
    x: 0,
    y: 0,
    zoom: ZOOM_RESET_LEVEL,
  };
  return flow.getSelectedNodes.value.map((node) => ({
    id: node.id,
    x: (node.computedPosition.x + (node.dimensions?.width ?? 0)) * zoom + panX,
    y: node.computedPosition.y * zoom + panY,
  }));
});

function emitDelete(ids: string[]) {
  if (ids.length) emit("delete-nodes", ids);
}

function deleteSelection() {
  emitDelete(flow.getSelectedNodes.value.map((node) => node.id));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

function onKeydown(event: KeyboardEvent) {
  if (!deleteKeys.value.has(event.key)) return;
  if (isEditableTarget(event.target)) return;
  if (!flow.getSelectedNodes.value.length) return;
  event.preventDefault();
  deleteSelection();
}

function resetZoom() {
  flow.zoomTo(ZOOM_RESET_LEVEL, { duration: ZOOM_TRANSITION_MS });
}

/**
 * Exposes the VueFlow controller through the component ref.
 * Node, edge, and other named VueFlow slots forward unchanged. Panel-position
 * slots render inside positioned panels; the default slot adds flow children.
 */
defineExpose(flow);
</script>

<template>
  <div class="dms-flow-canvas" :style="{ height }" @keydown="onKeydown">
    <VueFlow
      :id="flowId"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :fit-view-on-init="fitViewOnInit"
      v-bind="$attrs"
      :delete-key-code="resolvedDeleteKeyCode"
    >
      <template
        v-for="name in forwardedSlotNames"
        :key="name"
        #[name]="slotProps"
      >
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>

      <Background
        v-if="grid"
        :variant="grid"
        :gap="gridGap"
        :size="gridSize"
        :color="gridColor"
      />

      <Controls v-if="controls">
        <ControlButton
          v-if="zoomReadout"
          class="dms-flow-canvas__zoom-readout"
          :title="`Zoom ${zoomPercent}% — click to reset to 100%`"
          @click="resetZoom"
        >
          {{ zoomPercent }}%
        </ControlButton>
      </Controls>

      <MiniMap v-if="minimap" pannable zoomable />

      <Panel
        v-for="position in activePanelPositions"
        :key="position"
        :position="position"
      >
        <slot :name="position" />
      </Panel>

      <slot />
    </VueFlow>

    <div
      v-if="deletableNodes && deleteBadge"
      class="dms-flow-canvas__delete-layer"
    >
      <button
        v-for="affordance in deleteAffordances"
        :key="affordance.id"
        type="button"
        class="dms-flow-canvas__delete-button"
        :style="{ left: `${affordance.x}px`, top: `${affordance.y}px` }"
        :title="$t('dms.flow_canvas.delete_node')"
        :aria-label="$t('dms.flow_canvas.delete_node')"
        @click.stop="emitDelete([affordance.id])"
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style>
@import "@vue-flow/core/dist/style.css";
@import "@vue-flow/core/dist/theme-default.css";
@import "@vue-flow/controls/dist/style.css";
@import "@vue-flow/minimap/dist/style.css";

.dms-flow-canvas {
  position: relative;
  width: 100%;
  height: 100%;
}

.dms-flow-canvas .vue-flow {
  background-color: var(--ui-bg-muted);
  font-family: inherit;
}

/* Custom node renderers own their own surface; neutralize the default theme
   frame so it never bleeds through. */
.dms-flow-canvas .vue-flow__node {
  font-family: inherit;
  color: inherit;
}

/* Selected nodes get the DMS accent ring instead of the default theme's dark
   halo (which only targets the built-in node types), keeping node and edge
   selection states visually consistent. */
.dms-flow-canvas .vue-flow__node.selected {
  box-shadow: 0 0 0 1.5px var(--ui-color-primary-500);
}

/* Handles: primary accent, ringed with the card surface for contrast. */
.dms-flow-canvas .vue-flow__handle {
  width: 9px;
  height: 9px;
  background: var(--ui-color-primary-500);
  border: 2px solid var(--dms-surface-card);
  border-radius: 9999px;
}

.dms-flow-canvas .vue-flow__handle:hover {
  background: var(--ui-color-primary-400);
}

/* Edges: hairline by default, primary accent on selection / animation. */
.dms-flow-canvas .vue-flow__edge-path {
  stroke: var(--ui-border-accented);
  stroke-width: 1.5;
}

.dms-flow-canvas .vue-flow__edge.animated .vue-flow__edge-path {
  stroke: var(--ui-color-primary-500);
}

.dms-flow-canvas .vue-flow__edge.selected .vue-flow__edge-path,
.dms-flow-canvas .vue-flow__edge:focus .vue-flow__edge-path,
.dms-flow-canvas .vue-flow__edge:focus-visible .vue-flow__edge-path {
  stroke: var(--ui-color-primary-500);
  stroke-width: 2;
}

.dms-flow-canvas .vue-flow__connection-path {
  stroke: var(--ui-color-primary-500);
  stroke-width: 2;
}

/* Zoom/fit control bar, skinned onto the DMS card surface. */
.dms-flow-canvas .vue-flow__controls {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.dms-flow-canvas .vue-flow__controls-button {
  width: 28px;
  height: 28px;
  padding: 6px;
  border: none;
  background: var(--dms-surface-card);
  color: var(--ui-text-muted, #71717a);
  transition: background-color var(--dur-fast, 150ms) ease;
}

.dms-flow-canvas .vue-flow__controls-button:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted, inherit);
}

.dms-flow-canvas .vue-flow__controls-button svg {
  fill: currentColor;
  max-width: 14px;
  max-height: 14px;
}

/* Live zoom readout doubling as a reset-to-100% button: wider than the icon
   buttons and using tabular figures so the percentage doesn't jitter. */
.dms-flow-canvas .vue-flow__controls-button.dms-flow-canvas__zoom-readout {
  width: auto;
  min-width: 28px;
  padding: 4px 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

/* Overview minimap on the DMS card surface. */
.dms-flow-canvas .vue-flow__minimap {
  background: var(--dms-surface-card);
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  overflow: hidden;
}

.dms-flow-canvas .vue-flow__minimap-mask {
  fill: var(--ui-bg-muted);
  fill-opacity: 0.55;
}

/* On a phone the 200px overview would cover most of the canvas it maps:
   it hides below the Nuxt UI `sm` breakpoint (fit view / zoom remain). */
@media (max-width: 639.98px) {
  .dms-flow-canvas .vue-flow__minimap {
    display: none;
  }
}

/* Panels (toolbar/inspector slots) inherit the app typography. */
.dms-flow-canvas .vue-flow__panel {
  margin: 12px;
}

/* Delete affordance: a screen-space overlay (pointer-events pass through so
   pan/zoom keep working) holding one badge per selected node. */
.dms-flow-canvas__delete-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.dms-flow-canvas__delete-button {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  background: var(--dms-surface-card);
  color: var(--ui-text-muted, #71717a);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  pointer-events: auto;
  transition:
    color var(--dur-fast, 150ms) ease,
    border-color var(--dur-fast, 150ms) ease,
    background-color var(--dur-fast, 150ms) ease;
}

.dms-flow-canvas__delete-button:hover {
  border-color: var(--color-error, #ef4444);
  background: var(--ui-bg-elevated);
  color: var(--color-error, #ef4444);
}

.dms-flow-canvas__delete-button:focus-visible {
  outline: 2px solid var(--ui-color-primary-500);
  outline-offset: 1px;
}
</style>
