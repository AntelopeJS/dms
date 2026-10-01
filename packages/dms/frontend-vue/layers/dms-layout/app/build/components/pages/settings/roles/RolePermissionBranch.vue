<script setup lang="ts">
import RolePermissionLeaf from "./RolePermissionLeaf.vue";
import {
  childrenElementId,
  countSelected,
  hasChildren,
  type PermissionRowContext,
} from "./role-permissions";
import type { RolePermissionNode } from "./role-types";

interface RolePermissionBranchProps {
  /** The rows of this level: the children of an open area or row. */
  nodes: RolePermissionNode[];
  /** Nesting below the area, for `aria-level`. */
  level: number;
  context: PermissionRowContext;
}

const props = defineProps<RolePermissionBranchProps>();

function isExpanded(node: RolePermissionNode): boolean {
  return props.context.expanded.has(node.id);
}
</script>

<template>
  <!-- One level of the nested permission tree. A node with children is a
       collapsible row, closed until opened; its children are rendered only
       while it is open, behind an indentation guide. -->
  <template v-for="node in props.nodes" :key="node.id">
    <div
      v-if="hasChildren(node)"
      role="treeitem"
      :aria-level="props.level"
      :aria-expanded="isExpanded(node)"
    >
      <RolePermissionLeaf
        :node="node"
        :state="props.context.stateOf(node)"
        :change="props.context.changeOf(node.id)"
        :requires="props.context.requiresOf(node)"
        :auto-added-hint="props.context.autoAddedHintOf(node.id)"
        :disabled="props.context.isDisabled(node)"
        :disabled-hint="props.context.disabledHint"
        :count="
          countSelected(props.context.index, node.id, props.context.selection)
        "
        :expanded="isExpanded(node)"
        :controls="childrenElementId(node.id)"
        expandable
        @toggle="(checked) => props.context.toggle(node.id, checked)"
        @toggle-expanded="props.context.toggleExpanded(node.id)"
      />
      <div
        v-if="isExpanded(node)"
        :id="childrenElementId(node.id)"
        role="group"
        class="border-default ms-[17px] border-s ps-1.5"
      >
        <RolePermissionBranch
          :nodes="node.children ?? []"
          :level="props.level + 1"
          :context="props.context"
        />
      </div>
    </div>
    <div v-else role="treeitem" :aria-level="props.level">
      <RolePermissionLeaf
        :node="node"
        :state="props.context.stateOf(node)"
        :change="props.context.changeOf(node.id)"
        :requires="props.context.requiresOf(node)"
        :auto-added-hint="props.context.autoAddedHintOf(node.id)"
        :disabled="props.context.isDisabled(node)"
        :disabled-hint="props.context.disabledHint"
        gutter
        @toggle="(checked) => props.context.toggle(node.id, checked)"
      />
    </div>
  </template>
</template>
