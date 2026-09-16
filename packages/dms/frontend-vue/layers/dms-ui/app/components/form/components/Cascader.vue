<script setup lang="ts">
import {
  buildCascaderTree,
  CASCADER_FETCH_LIMIT,
  findCascaderNode,
  formatCascaderPath,
  isCascaderNodeSelectable,
  resolveCascaderKeyMapping,
  searchCascaderTree,
  type CascaderKeyMapping,
  type CascaderNode,
} from "../../../utils/cascader";

interface CascaderProps {
  searchUrl: string;
  keyMapping?: Partial<CascaderKeyMapping>;
  modelValue?: string | string[] | null;
  initialValue?: unknown;
  multiple?: boolean;
  deselectable?: boolean;
  leafOnly?: boolean;
  maxDepth?: number;
  placeholder?: string;
  fallback?: string;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  componentId?: string;
  pageId?: string;
  routeParams?: Record<string, string>;
}

const props = withDefaults(defineProps<CascaderProps>(), {
  deselectable: true,
});

const emit = defineEmits<{
  "update:modelValue": [value: string | string[] | undefined];
}>();

const instanceId = useId();
const { $authFetch } = useAuthFetch();
const toast = useToast();
const { t } = useI18n();
const { processI18n } = useTranslation();

interface CascaderResponse {
  results: Record<string, unknown>[];
  total: number;
}

const { data, status, execute } = await useDmsAsyncData(
  `cascader-${instanceId}`,
  () =>
    $authFetch<CascaderResponse>(props.searchUrl, {
      params: { limit: CASCADER_FETCH_LIMIT },
      onRequestError: ({ error }: { error: Error }) => {
        toast.add({
          color: Color.error,
          title: t("dms.form.error_title"),
          description: error.message,
        });
      },
    }),
  { lazy: true, immediate: false },
);

const keyMapping = computed(() => resolveCascaderKeyMapping(props.keyMapping));
const rows = computed(() => data.value?.results ?? []);
const isPartial = computed(
  () => (data.value?.total ?? 0) > rows.value.length && rows.value.length > 0,
);
const roots = computed(() =>
  buildCascaderTree(rows.value, keyMapping.value, { maxDepth: props.maxDepth }),
);
const selectionRules = computed(() => ({
  leafOnly: props.leafOnly,
  maxDepth: props.maxDepth,
}));

const selectedValues = computed<string[]>(() => {
  if (Array.isArray(props.modelValue)) {
    return props.modelValue.map(String);
  }
  return props.modelValue ? [String(props.modelValue)] : [];
});
const selectedSet = computed(() => new Set(selectedValues.value));

const open = ref(false);
const searchTerm = ref("");
const activePath = ref<string[]>([]);
const highlighted = ref<{ column: number; index: number }>({
  column: 0,
  index: 0,
});
const contentContainer = useTemplateRef<HTMLElement>("contentContainer");

const isSearching = computed(() => searchTerm.value.trim().length > 0);
const searchResults = computed(() =>
  searchCascaderTree(roots.value, searchTerm.value),
);

const columns = computed<CascaderNode[][]>(() => {
  const result: CascaderNode[][] = [roots.value];
  let nodes = roots.value;
  for (const value of activePath.value) {
    const node = nodes.find((candidate) => candidate.value === value);
    if (!node || node.children.length === 0) break;
    result.push(node.children);
    nodes = node.children;
  }
  return result;
});

function initialValueLabel(): string | undefined {
  const source = Array.isArray(props.initialValue)
    ? props.initialValue[0]
    : props.initialValue;
  if (!source || typeof source !== "object") return undefined;
  const label = (source as Record<string, unknown>)[keyMapping.value.label];
  return label === undefined || label === null ? undefined : String(label);
}

const triggerLabel = computed(() => {
  if (selectedValues.value.length === 0) return "";
  if (props.multiple) {
    return t("dms.form.cascader.selected_count", {
      count: selectedValues.value.length,
    });
  }
  const value = selectedValues.value[0]!;
  const node = findCascaderNode(roots.value, value);
  if (node) return formatCascaderPath(node);
  return initialValueLabel() ?? value;
});

const placeholderLabel = computed(() =>
  props.placeholder
    ? processI18n(props.placeholder)
    : t("dms.form.cascader.placeholder"),
);

function selectNode(node: CascaderNode) {
  if (props.multiple) {
    const next = selectedSet.value.has(node.value)
      ? selectedValues.value.filter((value) => value !== node.value)
      : [...selectedValues.value, node.value];
    emit("update:modelValue", next);
    return;
  }
  const isDeselect =
    props.deselectable && selectedValues.value[0] === node.value;
  emit("update:modelValue", isDeselect ? undefined : node.value);
  if (!isDeselect && node.children.length === 0) {
    open.value = false;
  }
}

function indexInColumn(node: CascaderNode, column: number): number {
  const index = (columns.value[column] ?? []).findIndex(
    (candidate) => candidate.value === node.value,
  );
  return Math.max(index, 0);
}

function revealNode(node: CascaderNode) {
  activePath.value = node.pathValues.slice(0, -1);
  highlighted.value = {
    column: node.depth - 1,
    index: indexInColumn(node, node.depth - 1),
  };
}

function handleColumnNodeClick(node: CascaderNode, column: number) {
  if (node.disabled) return;
  if (node.children.length > 0) {
    activePath.value = [...activePath.value.slice(0, column), node.value];
  } else {
    activePath.value = activePath.value.slice(0, column);
  }
  highlighted.value = { column, index: indexInColumn(node, column) };
  if (isCascaderNodeSelectable(node, selectionRules.value)) {
    selectNode(node);
  }
}

function handleSearchNodeClick(node: CascaderNode) {
  if (node.disabled) return;
  searchTerm.value = "";
  revealNode(node);
  if (node.children.length > 0) {
    activePath.value = node.pathValues;
  }
  if (isCascaderNodeSelectable(node, selectionRules.value)) {
    selectNode(node);
  }
}

function scrollHighlightedIntoView() {
  void nextTick(() => {
    contentContainer.value
      ?.querySelector('[data-cascader-highlighted="true"]')
      ?.scrollIntoView({ block: "nearest" });
  });
}

function currentList(): CascaderNode[] {
  if (isSearching.value) return searchResults.value;
  return columns.value[highlighted.value.column] ?? [];
}

function highlightedNode(): CascaderNode | undefined {
  return currentList()[highlighted.value.index];
}

function firstEnabledIndex(list: CascaderNode[]): number {
  const index = list.findIndex((node) => !node.disabled);
  return Math.max(index, 0);
}

function moveHighlight(delta: number) {
  const list = currentList();
  if (list.length === 0) return;
  let index = highlighted.value.index;
  for (let step = 0; step < list.length; step++) {
    index = (index + delta + list.length) % list.length;
    if (!list[index]?.disabled) break;
  }
  highlighted.value = { ...highlighted.value, index };
  scrollHighlightedIntoView();
}

function enterChildren() {
  if (isSearching.value) return;
  const node = highlightedNode();
  if (!node || node.disabled || node.children.length === 0) return;
  activePath.value = [
    ...activePath.value.slice(0, highlighted.value.column),
    node.value,
  ];
  highlighted.value = {
    column: highlighted.value.column + 1,
    index: firstEnabledIndex(node.children),
  };
  scrollHighlightedIntoView();
}

function exitChildren() {
  if (isSearching.value || highlighted.value.column === 0) return;
  const parentColumn = highlighted.value.column - 1;
  const parentValue = activePath.value[parentColumn];
  activePath.value = activePath.value.slice(0, parentColumn);
  highlighted.value = {
    column: parentColumn,
    index: (columns.value[parentColumn] ?? []).findIndex(
      (candidate) => candidate.value === parentValue,
    ),
  };
  scrollHighlightedIntoView();
}

function activateHighlighted() {
  const node = highlightedNode();
  if (!node) return;
  if (isSearching.value) {
    handleSearchNodeClick(node);
    return;
  }
  handleColumnNodeClick(node, highlighted.value.column);
}

const keyHandlers: Record<string, () => void> = {
  ArrowDown: () => moveHighlight(1),
  ArrowUp: () => moveHighlight(-1),
  ArrowRight: enterChildren,
  ArrowLeft: exitChildren,
  Enter: activateHighlighted,
  Escape: () => {
    open.value = false;
  },
};

function handleKeydown(event: KeyboardEvent) {
  const handler = keyHandlers[event.key];
  if (!handler) return;
  event.preventDefault();
  handler();
}

function syncActivePathToSelection() {
  const value = selectedValues.value[0];
  if (!value) return;
  const node = findCascaderNode(roots.value, value);
  if (node) revealNode(node);
}

function handleOpenChange(isOpen: boolean) {
  if (!isOpen) return;
  searchTerm.value = "";
  if (rows.value.length === 0) {
    void execute();
  }
  syncActivePathToSelection();
}

watch(roots, () => syncActivePathToSelection());

watch(searchTerm, () => {
  highlighted.value = {
    column: 0,
    index: firstEnabledIndex(searchResults.value),
  };
});

onMounted(() => {
  if (selectedValues.value.length > 0 || props.initialValue) {
    void execute();
  }
});

function nodeClasses(node: CascaderNode, isHighlighted: boolean): string[] {
  return [
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
    node.disabled
      ? "text-muted cursor-not-allowed opacity-50"
      : "hover:bg-elevated cursor-pointer",
    isHighlighted && !node.disabled ? "bg-elevated" : "",
    selectedSet.value.has(node.value)
      ? "text-primary font-medium"
      : "text-default",
  ];
}
</script>

<template>
  <div>
    <UPopover
      v-model:open="open"
      :portal="false"
      :content="{ align: 'start' }"
      :ui="{ content: 'z-50' }"
      @update:open="handleOpenChange"
    >
      <UButton
        :id="props.id"
        color="neutral"
        variant="outline"
        :disabled="props.disabled"
        trailing-icon="i-ph-caret-up-down"
        class="w-full justify-between font-normal"
        :aria-label="placeholderLabel"
      >
        <span v-if="triggerLabel" class="truncate">{{ triggerLabel }}</span>
        <span v-else class="text-dimmed truncate">{{ placeholderLabel }}</span>
      </UButton>

      <template #content>
        <div
          ref="contentContainer"
          class="flex max-w-[90vw] flex-col"
          @keydown="handleKeydown"
        >
          <UInput
            v-model="searchTerm"
            icon="i-ph-magnifying-glass"
            variant="none"
            autofocus
            :placeholder="t('dms.form.cascader.search_placeholder')"
            class="border-default border-b"
          />

          <div
            v-if="status === 'pending'"
            class="w-52 space-y-2 p-2"
            aria-busy="true"
          >
            <USkeleton v-for="i in 5" :key="i" class="h-6 w-full" />
          </div>

          <div
            v-else-if="rows.length === 0"
            class="text-muted w-52 px-2 py-6 text-center text-sm"
          >
            {{ t("dms.tree.no_entries") }}
          </div>

          <div
            v-else-if="isSearching"
            class="max-h-64 w-72 overflow-y-auto p-1"
            role="listbox"
          >
            <div
              v-if="searchResults.length === 0"
              class="text-muted px-2 py-6 text-center text-sm"
            >
              {{ t("dms.form.cascader.no_results") }}
            </div>
            <button
              v-for="(node, index) in searchResults"
              :key="node.pathValues.join('/')"
              type="button"
              role="option"
              :aria-selected="selectedSet.has(node.value)"
              :aria-disabled="node.disabled"
              :data-cascader-highlighted="
                highlighted.index === index ? 'true' : undefined
              "
              :class="nodeClasses(node, highlighted.index === index)"
              @click="handleSearchNodeClick(node)"
            >
              <span class="truncate">{{ formatCascaderPath(node) }}</span>
              <UIcon
                v-if="selectedSet.has(node.value)"
                name="i-ph-check"
                class="ml-auto size-4 shrink-0"
              />
            </button>
          </div>

          <div v-else class="divide-default flex divide-x overflow-x-auto">
            <div
              v-for="(column, columnIndex) in columns"
              :key="columnIndex"
              class="max-h-64 w-52 shrink-0 overflow-y-auto p-1"
              role="listbox"
            >
              <button
                v-for="(node, index) in column"
                :key="node.value"
                type="button"
                role="option"
                :aria-selected="selectedSet.has(node.value)"
                :aria-disabled="node.disabled"
                :data-cascader-highlighted="
                  highlighted.column === columnIndex &&
                  highlighted.index === index
                    ? 'true'
                    : undefined
                "
                :class="
                  nodeClasses(
                    node,
                    activePath[columnIndex] === node.value ||
                      (highlighted.column === columnIndex &&
                        highlighted.index === index),
                  )
                "
                @click="handleColumnNodeClick(node, columnIndex)"
              >
                <span class="truncate">{{ node.label }}</span>
                <span class="ml-auto flex shrink-0 items-center gap-1">
                  <UIcon
                    v-if="selectedSet.has(node.value)"
                    name="i-ph-check"
                    class="size-4"
                  />
                  <UIcon
                    v-if="node.children.length > 0"
                    name="i-ph-caret-right"
                    class="text-dimmed size-4"
                  />
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="isPartial && status !== 'pending'"
            class="border-default text-dimmed border-t px-2 py-1.5 text-xs"
          >
            {{
              t("dms.form.cascader.partial_results", {
                shown: rows.length,
                total: data?.total ?? 0,
              })
            }}
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
