<script setup lang="ts" generic="T extends Data">
import { get } from "@nuxt/ui/runtime/utils/index.js";
import KanbanBoard from "./KanbanBoard.vue";
import type { Data } from "../../build/components/table/Table.vue";
import type { TableViewDisplayContext } from "../../composables/table-view/types";
import { KANBAN_DISPLAY_BRIDGE_KEY } from "../../composables/table-view/kanban";

const props = defineProps<{ context: TableViewDisplayContext<T> }>();

interface KanbanDisplayOptions {
  groupByField?: string;
  cardFields?: string[];
  cardComponent?: ComponentInfo;
  draggable?: boolean;
  columnMaxHeight?: string;
}

const options = computed(
  () => (props.context.options ?? {}) as KanbanDisplayOptions,
);

// Group-by + the rest of the kanban-specific inputs come from the bridge that
// TableView provides (the generic context deliberately omits them). Falls back
// to a local ref when used outside a TableView (defensive).
const bridge = inject(KANBAN_DISPLAY_BRIDGE_KEY, undefined);
const fallbackGroupBy = ref(options.value.groupByField ?? "");
const groupByField = bridge?.groupByField ?? fallbackGroupBy;

const rowId = (item: T): string =>
  String(get(item, props.context.rowIdKey) ?? "");

const onCardClick = (item: T) => {
  if (props.context.actions.canEdit) {
    props.context.actions.edit(item);
    return;
  }
  props.context.actions.details(item);
};

const onCardDelete = (item: T) => {
  const id = rowId(item);
  if (id) props.context.actions.delete([id]);
};

const kanbanBoardRef = ref<{ refresh: () => Promise<void> } | null>(null);
defineExpose({ refresh: () => kanbanBoardRef.value?.refresh() });
</script>

<template>
  <KanbanBoard
    ref="kanbanBoardRef"
    v-model:group-by-field="groupByField"
    :location="context.location"
    :columns="context.columns"
    :label-key="context.labelKey"
    :row-id-key="context.rowIdKey"
    :card-fields="options.cardFields"
    :card-component="options.cardComponent"
    :draggable="options.draggable"
    :column-page-size="context.pagination.pageSize"
    :column-max-height="options.columnMaxHeight"
    :base-query="context.query"
    :component-id="context.componentId"
    :page-id="context.pageId"
    :edit-action="bridge?.editAction"
    :delete-action="bridge?.deleteAction"
    @card-click="(item) => onCardClick(item as T)"
    @card-delete="(item) => onCardDelete(item as T)"
  />
</template>
