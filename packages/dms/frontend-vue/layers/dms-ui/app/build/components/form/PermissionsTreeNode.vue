<script setup lang="ts">
export interface PermissionNode {
  id: string;
  label: string;
  icon?: string;
  children?: PermissionNode[];
}

interface PermissionsTreeNodeProps {
  node: PermissionNode;
  level?: number;
  checkedIds?: string[];
  expandedNodes?: Set<string>;
}

interface PermissionsTreeNodeEmits {
  (e: "toggle-expanded", id: string): void;
  (e: "check-change", node: PermissionNode, checked: boolean): void;
}

const props = withDefaults(defineProps<PermissionsTreeNodeProps>(), {
  level: 0,
  checkedIds: () => [],
  expandedNodes: () => new Set(),
});

const emit = defineEmits<PermissionsTreeNodeEmits>();

const { processI18n } = useTranslation();

const hasChildren = computed(
  () => props.node.children && props.node.children.length > 0,
);

const isExpanded = computed(() => props.expandedNodes.has(props.node.id));
const isChecked = computed(() => props.checkedIds.includes(props.node.id));

const getAllChildIds = (node: PermissionNode): string[] => {
  const ids = [node.id];
  if (node.children) {
    node.children.forEach((child) => {
      ids.push(...getAllChildIds(child));
    });
  }
  return ids;
};

const isIndeterminate = computed(() => {
  if (!hasChildren.value) return false;

  const descendantIds = getAllChildIds(props.node).filter(
    (id) => id !== props.node.id,
  );

  const checkedDescendants = descendantIds.filter((id) =>
    props.checkedIds.includes(id),
  );

  const hasChecked = checkedDescendants.length > 0;
  const hasUnchecked = checkedDescendants.length < descendantIds.length;

  return hasChecked && hasUnchecked;
});

const checkboxValue = computed((): boolean | "indeterminate" => {
  if (isIndeterminate.value) return "indeterminate";
  return isChecked.value;
});

const toggleExpanded = () => {
  emit("toggle-expanded", props.node.id);
};

const handleCheckChange = (value: boolean | "indeterminate") => {
  if (value === "indeterminate") return;
  emit("check-change", props.node, value);
};

const INDENT_SIZE = 24;
const BASE_PADDING = 8;
const LINE_SIZE = 1;
const ICON_SIZE = 14;

const paddingLeft = `${props.level * INDENT_SIZE + BASE_PADDING}px`;
const verticalLinePosition = `${props.level * INDENT_SIZE + BASE_PADDING + ICON_SIZE / 2 - LINE_SIZE / 2}px`;
</script>

<template>
  <div>
    <div
      :class="[
        { 'font-medium': level === 0 },
        checkboxValue === false ? 'text-dimmed' : 'text-highlighted',
        'hover:bg-elevated hover:text-highlighted flex items-center gap-3 rounded-sm py-1.5 transition-colors select-none',
      ]"
      :style="{ paddingLeft }"
      @click="toggleExpanded"
    >
      <div class="flex items-center gap-2">
        <UIcon
          :name="hasChildren ? 'i-lucide-chevron-right' : 'i-lucide-dot'"
          :class="[
            isExpanded ? 'rotate-90' : '',
            'size-3.5 transition-transform',
          ]"
        />

        <UCheckbox
          :model-value="checkboxValue"
          size="sm"
          @update:model-value="handleCheckChange"
          @click.stop
        />
      </div>

      <div class="flex items-center gap-1">
        <UIcon
          v-if="node.icon"
          :name="node.icon"
          class="text-dimmed size-3.5"
        />

        <span class="flex-1 text-sm">{{ processI18n(node.label) }}</span>
      </div>
    </div>

    <div v-if="hasChildren && isExpanded" class="relative">
      <div
        class="bg-default absolute top-0 bottom-0 left-0 w-px"
        :style="{ left: verticalLinePosition }"
      />

      <PermissionsTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :checked-ids="checkedIds"
        :expanded-nodes="expandedNodes"
        @toggle-expanded="(id: string) => emit('toggle-expanded', id)"
        @check-change="
          (childNode: PermissionNode, childChecked: boolean) =>
            emit('check-change', childNode, childChecked)
        "
      />
    </div>
  </div>
</template>
