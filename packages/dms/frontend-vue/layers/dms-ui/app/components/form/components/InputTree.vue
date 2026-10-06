<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../../dms-core/app/types/component";
import Tree from "../../tree/Tree.vue";
import type { TreeNode } from "../../../composables/tree/types";
import { TreeSelectionBehavior } from "../../../composables/tree/types/props";
import { FIELD_RING_INVALID_CLASS } from "../../../build/utils/fieldTrigger";
interface InputTreeProps extends DefaultComponentProps {
  items?: TreeNode[];
  fetchUrl?: string;
  multiple?: boolean;
  placeholder?: string;
  modelValue?: string | string[];
  disabled?: boolean;
}

const props = withDefaults(defineProps<InputTreeProps>(), {
  items: () => [],
  fetchUrl: "",
  multiple: false,
  modelValue: undefined,
  disabled: false,
  placeholder: "",
});

const emit = defineEmits<{
  "update:modelValue": [value: string | string[] | undefined];
}>();

// Shallow for the same reason as the selection in `useTree`: a deeply
// unwrapped tree node is an unbounded type. The list is always replaced,
// never mutated in place.
const availableItems: Ref<TreeNode[]> = shallowRef(props.items || []);

const findNodeByValue = (
  nodes: TreeNode[],
  value: string,
): TreeNode | undefined => {
  for (const node of nodes) {
    if (node.value === value) return node;
    if (node.children) {
      const found = findNodeByValue(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
};

function selectionValue(
  value: TreeNode | TreeNode[] | undefined,
): string | string[] | undefined {
  if (!value) return props.multiple ? [] : undefined;
  if (Array.isArray(value)) {
    return value.map((item) => item.value).filter(Boolean) as string[];
  }
  return value.value;
}

const selectedNodes = computed({
  get: () => {
    if (!props.modelValue || availableItems.value.length === 0) {
      return props.multiple ? [] : undefined;
    }

    if (props.multiple && Array.isArray(props.modelValue)) {
      return props.modelValue
        .map((val) => findNodeByValue(availableItems.value, val))
        .filter(Boolean) as TreeNode[];
    }

    return findNodeByValue(availableItems.value, props.modelValue as string);
  },
  set: (value: TreeNode | TreeNode[] | undefined) => {
    emit("update:modelValue", selectionValue(value));
    // After the update: the field re-validates its new value.
    emitFormChange();
  },
});

// The field state UFormField hands its control: the tree card is ringed when
// the field is invalid, and each pick re-validates it.
const { color: fieldColor, ariaAttrs, emitFormChange } = useFormField();
const invalid = computed(() => fieldColor.value === "error");

function handleTreeItemsLoaded(items: TreeNode[]) {
  availableItems.value = items;
}
</script>

<template>
  <div
    role="group"
    v-bind="ariaAttrs"
    :class="invalid && FIELD_RING_INVALID_CLASS"
    @click.prevent.capture
  >
    <Tree
      :model-value="selectedNodes"
      :static-nodes="props.items"
      :fetch-url="props.fetchUrl"
      :multiple="props.multiple"
      :disabled="props.disabled"
      :selection-behavior="TreeSelectionBehavior.toggle"
      :component-id="props.componentId"
      :page-id="props.pageId"
      @update:model-value="selectedNodes = $event"
      @items-loaded="handleTreeItemsLoaded"
    />
  </div>
</template>
