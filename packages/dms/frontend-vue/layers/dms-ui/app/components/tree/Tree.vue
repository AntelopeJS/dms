<script setup lang="ts">
import type { TreeNode, TreeProps } from "../../composables/tree/types";
import {
  TreeSelectionBehavior,
  TreeNavigationDirection,
} from "../../composables/tree/types";
import { buildTreeShortcuts } from "../../composables/tree/shortcuts";

const { processI18n } = useTranslation();

const props = withDefaults(defineProps<TreeProps>(), {
  color: Color.primary,
  size: Size.medium,
  multiple: false,
  disabled: false,
  selectionBehavior: TreeSelectionBehavior.toggle,
  propagateSelect: false,
  lazyLoad: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: TreeNode | TreeNode[] | undefined];
  "items-loaded": [value: TreeNode[]];
}>();

const { items, itemsRef, selected, loading, isAnyNodeLoading, expandedNodes } =
  await useTree(props);

watch(
  () => props.modelValue,
  (newValue) => {
    if (props.multiple) {
      const currentValues = Array.isArray(selected.value)
        ? (selected.value as TreeNode[])
            .map((n) => n.value)
            .sort()
            .join(",")
        : "";
      const newValues = Array.isArray(newValue)
        ? (newValue as TreeNode[])
            .map((n) => n.value)
            .sort()
            .join(",")
        : "";

      if (currentValues !== newValues) {
        selected.value = newValue;
      }
    } else {
      const currentValue =
        selected.value && !Array.isArray(selected.value)
          ? selected.value.value
          : undefined;
      const newVal =
        newValue && !Array.isArray(newValue) ? newValue.value : undefined;

      if (currentValue !== newVal) {
        selected.value = newValue;
      }
    }
  },
  { deep: true },
);

onMounted(() => {
  emit("items-loaded", items.value);
});

watch(items, (newItems) => {
  if (newItems && newItems.length > 0) {
    emit("items-loaded", newItems);
  }
});

watch(
  selected,
  (newValue) => {
    emit("update:modelValue", newValue);
  },
  { deep: true },
);

const treeContainer = useTemplateRef<HTMLElement>("treeContainer");
const focusedNodeIndex = ref(0);

function navigateTree(direction: TreeNavigationDirection) {
  if (!treeContainer.value) return;

  const activeElement = document.activeElement;
  if (!activeElement || !treeContainer.value.contains(activeElement)) return;

  const allNodes = treeContainer.value.querySelectorAll('[role="treeitem"]');
  if (!allNodes.length) return;

  const navigationHandlers: Record<TreeNavigationDirection, () => void> = {
    [TreeNavigationDirection.DOWN]: () => {
      focusedNodeIndex.value = Math.min(
        focusedNodeIndex.value + 1,
        allNodes.length - 1,
      );
      (allNodes[focusedNodeIndex.value] as HTMLElement)?.focus();
    },
    [TreeNavigationDirection.UP]: () => {
      focusedNodeIndex.value = Math.max(focusedNodeIndex.value - 1, 0);
      (allNodes[focusedNodeIndex.value] as HTMLElement)?.focus();
    },
    [TreeNavigationDirection.SELECT]: () => {
      (allNodes[focusedNodeIndex.value] as HTMLElement)?.click();
    },
    [TreeNavigationDirection.HOME]: () => {
      focusedNodeIndex.value = 0;
      (allNodes[0] as HTMLElement)?.focus();
    },
    [TreeNavigationDirection.END]: () => {
      focusedNodeIndex.value = allNodes.length - 1;
      (allNodes[allNodes.length - 1] as HTMLElement)?.focus();
    },
  };

  navigationHandlers[direction]();
}

const shortcutHandlers: Record<string, () => void> = (
  buildTreeShortcuts as (...args: unknown[]) => Record<string, () => void>
)({
  navigateTree,
  props,
  items,
  selected,
});
defineShortcuts(shortcutHandlers as Record<string, (() => void) | undefined>);
</script>

<template>
  <DmsCard>
    <template v-if="props.title">
      <section class="space-y-1">
        <h2 class="text-highlighted text-xl font-semibold">
          {{ processI18n(props.title) }}
        </h2>

        <p v-if="props.description" class="text-dimmed text-sm">
          {{ processI18n(props.description) }}
        </p>
      </section>
    </template>

    <div
      ref="treeContainer"
      class="my-2"
      tabindex="0"
      :aria-label="props.title || 'Tree navigation'"
      :aria-busy="loading || isAnyNodeLoading"
    >
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-2">
          <USkeleton class="size-4 shrink-0" />
          <USkeleton class="h-4" :style="{ width: `${80 + i * 20}px` }" />
        </div>
        <div class="ml-6 space-y-3">
          <div v-for="j in 3" :key="`sub-${j}`" class="flex items-center gap-2">
            <USkeleton class="size-4 shrink-0" />
            <USkeleton class="h-4" :style="{ width: `${60 + j * 15}px` }" />
          </div>
        </div>
      </div>

      <UTree
        v-else-if="!loading && items.length > 0"
        v-model="selected"
        :items="itemsRef"
        :color="props.color as ColorValue"
        :size="props.size"
        :trailing-icon="props.trailingIcon"
        :expanded-icon="props.expandedIcon"
        :collapsed-icon="props.collapsedIcon"
        :multiple="props.multiple"
        :expanded="Array.from(expandedNodes)"
        :disabled="props.disabled || isAnyNodeLoading"
        :selection-behavior="props.selectionBehavior"
        :propagate-select="props.propagateSelect"
        :get-key="
          (item: TreeNode) => item.hierarchicalPath || item.value || item.label
        "
      />

      <div
        v-else-if="!loading && items.length === 0"
        class="text-muted py-8 text-center"
      >
        {{ $t("dms.tree.no_entries") }}
      </div>
    </div>
  </DmsCard>
</template>
