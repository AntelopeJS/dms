<script setup lang="ts">
import {
  type Connection,
  Handle,
  type NodeDragEvent,
  Position,
} from "@vue-flow/core";
import { ref } from "vue";

interface DemoNodeData {
  label: string;
  icon: string;
  accent?: boolean;
}

interface DemoNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: DemoNodeData;
}

interface DemoEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
}

type GridVariant = "dots" | "lines" | false;

const STAGE_NODE_TYPE = "stage";
const GRID_VARIANTS: GridVariant[] = ["dots", "lines", false];
const NEW_NODE_ROW = 2;

const COLUMN_STEP = 260;
const BRANCH_OFFSET = 110;

interface StageSpec {
  id: string;
  column: number;
  row: number;
  data: DemoNodeData;
}

const STAGES: StageSpec[] = [
  {
    id: "trigger",
    column: 0,
    row: 0,
    data: { label: "Trigger", icon: "i-ph-lightning", accent: true },
  },
  {
    id: "validate",
    column: 1,
    row: 0,
    data: { label: "Validate", icon: "i-ph-check-circle" },
  },
  {
    id: "transform",
    column: 2,
    row: -1,
    data: { label: "Transform", icon: "i-ph-function" },
  },
  {
    id: "enrich",
    column: 2,
    row: 1,
    data: { label: "Enrich", icon: "i-ph-sparkle" },
  },
  {
    id: "merge",
    column: 3,
    row: 0,
    data: { label: "Merge", icon: "i-ph-git-merge" },
  },
  {
    id: "output",
    column: 4,
    row: 0,
    data: { label: "Output", icon: "i-ph-export" },
  },
];

const nodes = ref<DemoNode[]>(
  STAGES.map((stage) => ({
    id: stage.id,
    type: STAGE_NODE_TYPE,
    position: { x: stage.column * COLUMN_STEP, y: stage.row * BRANCH_OFFSET },
    data: stage.data,
  })),
);

const edges = ref<DemoEdge[]>([
  {
    id: "e-trigger-validate",
    source: "trigger",
    target: "validate",
    animated: true,
  },
  { id: "e-validate-transform", source: "validate", target: "transform" },
  { id: "e-validate-enrich", source: "validate", target: "enrich" },
  { id: "e-transform-merge", source: "transform", target: "merge" },
  { id: "e-enrich-merge", source: "enrich", target: "merge" },
  {
    id: "e-merge-output",
    source: "merge",
    target: "output",
    animated: true,
  },
]);

const canvas = ref<{ fitView: () => void } | null>(null);
const deleteBadge = ref(true);
const grid = ref<GridVariant>("dots");
const hasControls = ref(true);
let nodeCounter = 0;
let edgeCounter = 0;

function addNode() {
  nodeCounter += 1;
  nodes.value = [
    ...nodes.value,
    {
      id: `node-${nodeCounter}`,
      type: STAGE_NODE_TYPE,
      position: {
        x: (nodeCounter - 1) * COLUMN_STEP,
        y: NEW_NODE_ROW * BRANCH_OFFSET,
      },
      data: { label: `Node ${nodeCounter}`, icon: "i-ph-cube" },
    },
  ];
}

function onNodeDragStop({ nodes: dragged }: NodeDragEvent) {
  const movedPositions = new Map(
    dragged.map((node) => [node.id, node.position]),
  );
  nodes.value = nodes.value.map((node) => {
    const position = movedPositions.get(node.id);
    return position ? { ...node, position: { ...position } } : node;
  });
}

function onConnect(connection: Connection) {
  edgeCounter += 1;
  edges.value = [
    ...edges.value,
    {
      id: `edge-${edgeCounter}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      animated: true,
    },
  ];
}

function onDeleteNodes(ids: string[]) {
  const removed = new Set(ids);
  nodes.value = nodes.value.filter((node) => !removed.has(node.id));
  edges.value = edges.value.filter(
    (edge) => !removed.has(edge.source) && !removed.has(edge.target),
  );
}

function cycleGrid() {
  const next = (GRID_VARIANTS.indexOf(grid.value) + 1) % GRID_VARIANTS.length;
  grid.value = GRID_VARIANTS[next];
}

function fitView() {
  canvas.value?.fitView();
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-default">
    <DmsFlowCanvas
      ref="canvas"
      :nodes="nodes"
      :edges="edges"
      minimap
      deletable-nodes
      :delete-badge="deleteBadge"
      :grid="grid"
      :controls="hasControls"
      zoom-readout
      @connect="onConnect"
      @node-drag-stop="onNodeDragStop"
      @delete-nodes="onDeleteNodes"
    >
      <template #node-stage="{ data }">
        <div class="demo-node" :class="{ 'demo-node--accent': data.accent }">
          <Handle type="target" :position="Position.Left" />
          <UIcon :name="data.icon" class="demo-node__icon" />
          <span class="demo-node__label">{{ data.label }}</span>
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>

      <template #top-right>
        <div class="demo-toolbar">
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-ph-plus"
            label="Add node"
            @click="addNode"
          />
          <div class="demo-toolbar__divider" />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-ph-arrows-out"
            label="Fit view"
            @click="fitView"
          />
          <div class="demo-toolbar__divider" />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-ph-trash"
            :label="deleteBadge ? 'Hide delete badge' : 'Show delete badge'"
            @click="deleteBadge = !deleteBadge"
          />
          <div class="demo-toolbar__divider" />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-ph-grid-four"
            :label="`Grid: ${grid || 'none'}`"
            @click="cycleGrid"
          />
          <div class="demo-toolbar__divider" />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-ph-sliders-horizontal"
            :label="hasControls ? 'Hide controls' : 'Show controls'"
            @click="hasControls = !hasControls"
          />
        </div>
      </template>
    </DmsFlowCanvas>
  </div>
</template>

<style scoped>
.demo-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 168px;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.625rem;
  background: var(--dms-surface-card);
  box-shadow: var(--shadow-md);
  font-size: 0.875rem;
  color: var(--ui-text-highlighted);
}

.demo-node--accent {
  border-color: var(--color-dms-500);
}

.demo-node__icon {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  color: var(--color-dms-500);
}

.demo-node__label {
  font-weight: 500;
}

.demo-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  box-shadow: var(--shadow-md);
}

.demo-toolbar__divider {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.25rem;
  background: var(--ui-border);
}
</style>
