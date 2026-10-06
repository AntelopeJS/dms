<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../../dms-core/app/types/component";
import type { PermissionNode } from "../../../build/components/form/PermissionsTreeNode.vue";
import PermissionsTreeNode from "../../../build/components/form/PermissionsTreeNode.vue";
interface PermissionsTreeProps extends DefaultComponentProps {
  id?: string;
  permissions?: PermissionNode[];
  fetchUrl?: string;
}

const props = withDefaults(defineProps<PermissionsTreeProps>(), {
  permissions: () => [],
  fetchUrl: "",
});

const selectedIds = defineModel<string[]>({ default: () => [] });
// Each checkbox gets an id of its own, not the field's.
const generatedId = useId();
const idPrefix = computed(() => props.id ?? generatedId);

// The field state UFormField hands its control: taken here so the checkboxes
// of the tree do not each turn red, shown as one error border on the panel.
const { color: fieldColor, ariaAttrs, emitFormChange } = useFormField();
const invalid = computed(() => fieldColor.value === "error");
watch(selectedIds, () => emitFormChange());
const expandedNodes = ref<Set<string>>(new Set());

const { $authFetch } = useAuthFetch();

const dataLoader = props.fetchUrl
  ? () => $authFetch<PermissionNode[]>(props.fetchUrl!, { method: "GET" })
  : () => Promise.resolve(props.permissions || []);

const { data: fetchedPermissions } = await useDmsAsyncData(
  `permissions-tree-${props.componentId}-${props.pageId}`,
  dataLoader,
  {
    watch: props.fetchUrl ? [() => props.fetchUrl] : [],
    default: () => [] as PermissionNode[],
  },
);

// `data` stays nullable until the first load resolves, so the tree reads it
// through this normalized view.
const permissionTree = computed<PermissionNode[]>(
  () => fetchedPermissions.value ?? [],
);

const getAncestorPaths = (path: string): string[] => {
  const parts = path.split(".");
  const paths: string[] = [];

  for (let i = parts.length; i > 0; i--) {
    paths.push(parts.slice(0, i).join("."));
  }

  return paths;
};

const getAllChildIds = (node: PermissionNode): string[] => {
  const ids = [node.id];
  if (node.children) {
    node.children.forEach((child) => {
      ids.push(...getAllChildIds(child));
    });
  }
  return ids;
};

const findNodeById = (
  id: string,
  nodes: PermissionNode[],
): PermissionNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(id, node.children);
      if (found) return found;
    }
  }
  return null;
};

const shouldRemoveParent = (
  parentId: string,
  remainingIds: string[],
): boolean => {
  const parentNode = findNodeById(parentId, permissionTree.value);
  if (!parentNode || !parentNode.children) return false;

  const descendantIds = getAllChildIds(parentNode).filter(
    (id) => id !== parentNode.id,
  );

  return !descendantIds.some((id) => remainingIds.includes(id));
};

const toggleExpanded = (id: string) => {
  const newExpanded = new Set(expandedNodes.value);
  if (newExpanded.has(id)) {
    newExpanded.delete(id);
  } else {
    newExpanded.add(id);
  }
  expandedNodes.value = newExpanded;
};

const handleCheckChange = (node: PermissionNode, checked: boolean) => {
  const descendantIds = getAllChildIds(node);
  const ancestorPaths = getAncestorPaths(node.id);

  if (checked) {
    const idsToAdd = [...descendantIds, ...ancestorPaths];
    selectedIds.value = [...new Set([...selectedIds.value, ...idsToAdd])];
  } else {
    let remainingIds = selectedIds.value.filter(
      (id) => !descendantIds.includes(id),
    );

    const ancestorsToRemove = ancestorPaths.filter((ancestorId) =>
      shouldRemoveParent(ancestorId, remainingIds),
    );
    remainingIds = remainingIds.filter((id) => !ancestorsToRemove.includes(id));

    selectedIds.value = remainingIds;
  }
};
</script>

<template>
  <div
    class="bg-default space-y-1 rounded-lg border p-2"
    :class="invalid ? 'border-error' : 'border-default'"
    :id="props.id"
    role="group"
    v-bind="ariaAttrs"
  >
    <PermissionsTreeNode
      v-for="item in permissionTree"
      :key="item.id"
      :node="item"
      :id-prefix="idPrefix"
      :level="0"
      :checked-ids="selectedIds"
      :expanded-nodes="expandedNodes"
      @toggle-expanded="toggleExpanded"
      @check-change="handleCheckChange"
    />
  </div>
</template>
