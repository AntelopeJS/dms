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

const STAGE_NODE_TYPE = "stage";
const NEW_NODE_X = 320;
const NEW_NODE_Y_STEP = 96;

const nodes = ref<DemoNode[]>([
  {
    id: "trigger",
    type: STAGE_NODE_TYPE,
    position: { x: 0, y: 0 },
    data: { label: "Trigger", icon: "i-ph-lightning", accent: true },
  },
  {
    id: "transform",
    type: STAGE_NODE_TYPE,
    position: { x: 0, y: 150 },
    data: { label: "Transform", icon: "i-ph-function" },
  },
  {
    id: "output",
    type: STAGE_NODE_TYPE,
    position: { x: 0, y: 300 },
    data: { label: "Output", icon: "i-ph-export" },
  },
]);

const edges = ref<DemoEdge[]>([
  {
    id: "e-trigger-transform",
    source: "trigger",
    target: "transform",
    animated: true,
  },
  { id: "e-transform-output", source: "transform", target: "output" },
]);

const canvas = ref<{ fitView: () => void } | null>(null);
let nodeCounter = 0;
let edgeCounter = 0;

function addNode() {
  nodeCounter += 1;
  nodes.value = [
    ...nodes.value,
    {
      id: `node-${nodeCounter}`,
      type: STAGE_NODE_TYPE,
      position: { x: NEW_NODE_X, y: nodeCounter * NEW_NODE_Y_STEP },
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

function fitView() {
  canvas.value?.fitView();
}
</script>

<template>
  <div
    class="h-[calc(100vh-7rem)] overflow-hidden rounded-lg border border-default"
  >
    <DmsFlowCanvas
      ref="canvas"
      :nodes="nodes"
      :edges="edges"
      minimap
      deletable-nodes
      zoom-readout
      @connect="onConnect"
      @node-drag-stop="onNodeDragStop"
      @delete-nodes="onDeleteNodes"
    >
      <template #node-stage="{ data }">
        <div class="demo-node" :class="{ 'demo-node--accent': data.accent }">
          <Handle type="target" :position="Position.Top" />
          <UIcon :name="data.icon" class="demo-node__icon" />
          <span class="demo-node__label">{{ data.label }}</span>
          <Handle type="source" :position="Position.Bottom" />
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
