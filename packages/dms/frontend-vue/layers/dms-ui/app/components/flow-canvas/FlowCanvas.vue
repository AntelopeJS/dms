<script setup lang="ts">
import { Background } from "@vue-flow/background";
import { ControlButton, Controls } from "@vue-flow/controls";
import { Panel, PanelPosition, useVueFlow, VueFlow } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import type { Component } from "vue";
import { computed, useId, useSlots } from "vue";

// Generic DMS-themed wrapper around @vue-flow/core. It owns the canvas
// "chrome" (dotted background, zoom controls, optional minimap, themed
// node/handle/edge styling, pan/zoom + fit-view) and stays free of any
// business logic: consumers pass their own `nodeTypes`/`edgeTypes`, drive
// data through `nodes`/`edges`, and reach the imperative flow controller via
// a template ref (see <defineExpose>). Any VueFlow prop or event not declared
// here is forwarded through `$attrs` (e.g. `nodes-draggable`, `pan-on-drag`,
// `is-valid-connection`, `@connect`, `@nodes-change`, `@node-drag-stop`).
//
// Slots:
// - `#node-<type>` / `#edge-<type>` (and any other VueFlow slot such as
//   `#connection-line`) are forwarded verbatim, so consumers can declare
//   custom renderers inline instead of passing `nodeTypes`/`edgeTypes`.
// - One slot per `PanelPosition` (`#top-left`, `#bottom-center`, …) renders
//   its content inside a positioned VueFlow `<Panel>` — toolbars, inspectors.
// - The default slot is appended as raw VueFlow children, for anything else
//   the consumer needs to mount inside the flow (extra panels, overlays).
//
// Opt-in affordances (all default-off, so existing consumers are untouched):
// - `deletableNodes` renders a themed delete badge on selected nodes and lets
//   Delete/Backspace remove the selection. Both paths only *emit* the
//   `delete-nodes` intent — the badge for its own node, Delete/Backspace for
//   the whole selection — the wrapper never mutates the consumer's
//   `nodes`/`edges`; the consumer applies the removal.
// - `zoomReadout` adds a live zoom percentage to the control bar that doubles
//   as a reset-to-100% button.
//
// - dms-automation plugs its GenericNode/GroupNode editor onto it.
// - dms-database plugs its table/relation ERD onto it (imperative setNodes
//   + dagre layout live in the consumer).

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
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
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
   * Add a live zoom percentage / reset-to-100% control to the control bar.
   * It renders inside the bar, so it requires `controls` to be enabled.
   */
  zoomReadout?: boolean;
}

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
  zoomReadout: false,
});

const emit = defineEmits<{
  /** Deletion intent for the given node ids (keyboard or badge). */
  "delete-nodes": [ids: string[]];
}>();

defineOptions({ inheritAttrs: false });

// A stable per-instance id binds the rendered <VueFlow> and the controller we
// expose to the same store, so imperative consumers (fitView, setNodes,
// onNodeDrag…) act on this canvas and not a detached instance.
const flowId = useId();
const flow = useVueFlow(flowId);

const slots = useSlots();

const isPanelSlot = (name: string): name is PanelPosition =>
  (PANEL_POSITIONS as readonly string[]).includes(name);

const activePanelPositions = computed(() =>
  PANEL_POSITIONS.filter((position) => slots[position]),
);

const forwardedSlotNames = computed(() =>
  Object.keys(slots).filter((name) => name !== "default" && !isPanelSlot(name)),
);

// Keys our emit-only keyboard path listens for. Empty while delete is off or
// when the consumer passes `deleteKeyCode: null` (badge-only); otherwise the
// consumer's key(s), defaulting to Delete + Backspace.
const deleteKeys = computed<Set<string>>(() => {
  if (!props.deletableNodes) return new Set();
  const code =
    props.deleteKeyCode === undefined
      ? DEFAULT_DELETE_KEYS
      : props.deleteKeyCode;
  if (code === null) return new Set();
  return new Set(Array.isArray(code) ? code : [code]);
});

// While delete is enabled we own the keyboard path (emit-only), so VueFlow's
// built-in mutating delete is disabled with `null`. While it's off we resolve
// to `undefined`, which VueFlow skips (isDef guard) — its native "Backspace"
// default stays untouched, so existing consumers are unaffected.
const resolvedDeleteKeyCode = computed<DeleteKeyCode | undefined>(() =>
  props.deletableNodes ? null : undefined,
);

const zoomPercent = computed(() =>
  Math.round((flow.viewport.value?.zoom ?? ZOOM_RESET_LEVEL) * 100),
);

// Project each selected node's top-right corner from flow space to screen
// space through the live viewport transform, so badges track pan/zoom/drag.
const deleteAffordances = computed<DeleteAffordance[]>(() => {
  if (!props.deletableNodes) return [];
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

    <div v-if="deletableNodes" class="dms-flow-canvas__delete-layer">
      <button
        v-for="affordance in deleteAffordances"
        :key="affordance.id"
        type="button"
        class="dms-flow-canvas__delete-button"
        :style="{ left: `${affordance.x}px`, top: `${affordance.y}px` }"
        title="Delete node"
        aria-label="Delete node"
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
  box-shadow: 0 0 0 1.5px var(--color-dms-500);
}

/* Handles: DMS cyan accent, ringed with the card surface for contrast. */
.dms-flow-canvas .vue-flow__handle {
  width: 9px;
  height: 9px;
  background: var(--color-dms-500);
  border: 2px solid var(--dms-surface-card);
  border-radius: 9999px;
}

.dms-flow-canvas .vue-flow__handle:hover {
  background: var(--color-dms-400);
}

/* Edges: hairline by default, cyan accent on selection / animation. */
.dms-flow-canvas .vue-flow__edge-path {
  stroke: var(--ui-border-accented);
  stroke-width: 1.5;
}

.dms-flow-canvas .vue-flow__edge.animated .vue-flow__edge-path {
  stroke: var(--color-dms-500);
}

.dms-flow-canvas .vue-flow__edge.selected .vue-flow__edge-path,
.dms-flow-canvas .vue-flow__edge:focus .vue-flow__edge-path,
.dms-flow-canvas .vue-flow__edge:focus-visible .vue-flow__edge-path {
  stroke: var(--color-dms-500);
  stroke-width: 2;
}

.dms-flow-canvas .vue-flow__connection-path {
  stroke: var(--color-dms-500);
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
  outline: 2px solid var(--color-dms-500);
  outline-offset: 1px;
}
</style>
