<script setup lang="ts" generic="T extends Data">
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { ComponentChild, ComponentInfo } from "#dms-core/app/types/page";
import {
  isBoolean,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import KanbanBoard from "./KanbanBoard.vue";
import type { Data } from "../../build/components/table/TableRoot.vue";
import type {
  TableViewCardConfig,
  TableViewDisplayContext,
} from "../../composables/table-view/types";
import { KANBAN_DISPLAY_BRIDGE_KEY } from "../../composables/table-view/kanban";

const props = defineProps<{ context: TableViewDisplayContext<T> }>();

interface KanbanDisplayOptions {
  groupByField?: string;
  card?: TableViewCardConfig;
  draggable?: boolean;
  columnMaxHeight?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && value !== null && !Array.isArray(value);

const isComponentInfo = (value: unknown): value is ComponentInfo =>
  isRecord(value) &&
  (value.componentName === undefined || isString(value.componentName)) &&
  (value.options === undefined || isRecord(value.options)) &&
  (value.children === undefined ||
    (Array.isArray(value.children) && value.children.every(isComponentChild)));

const isComponentChild = (value: unknown): value is ComponentChild =>
  isRecord(value) &&
  isString(value.id) &&
  isComponentInfo(value.component) &&
  (value.slot === undefined || isString(value.slot));

const isCardConfig = (value: unknown): value is TableViewCardConfig =>
  isRecord(value) &&
  (value.fields === undefined ||
    (Array.isArray(value.fields) && value.fields.every(isString))) &&
  (value.component === undefined || isComponentInfo(value.component)) &&
  (value.minWidth === undefined || isString(value.minWidth)) &&
  (value.skeletonHeight === undefined || isString(value.skeletonHeight));

const options = computed((): KanbanDisplayOptions => {
  const { groupByField, card, draggable, columnMaxHeight } =
    props.context.options ?? {};
  return {
    groupByField: isString(groupByField) ? groupByField : undefined,
    card: isCardConfig(card) ? card : undefined,
    draggable: isBoolean(draggable) ? draggable : undefined,
    columnMaxHeight: isString(columnMaxHeight) ? columnMaxHeight : undefined,
  };
});

const bridge = inject(KANBAN_DISPLAY_BRIDGE_KEY, undefined);
const fallbackGroupBy = ref(options.value.groupByField ?? "");
const groupByField = bridge?.groupByField ?? fallbackGroupBy;

const rowId = (item: T): string =>
  String(get(item, props.context.rowIdKey) ?? "");

const onCardClick = (item: T) => props.context.actions.open(item);

const onCardDelete = (item: T) => {
  const id = rowId(item);

  if (id) props.context.actions.delete([id], [item]);
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
    :card-fields="options.card?.fields"
    :card-component="options.card?.component"
    :card-context="context"
    :draggable="options.draggable"
    :column-page-size="context.pagination.pageSize"
    :column-max-height="options.columnMaxHeight"
    :base-query="context.query"
    :component-id="context.componentId"
    :page-id="context.pageId"
    :edit-action="bridge?.editAction"
    :delete-action="bridge?.deleteAction"
    @card-click="(item) => onCardClick(item)"
    @card-delete="(item) => onCardDelete(item as T)"
    @moved="bridge?.onCardMoved?.()"
    @rows-shown="(items) => context.setShownRows?.(items)"
  />
</template>
