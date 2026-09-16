<script setup lang="ts" generic="T extends Data">
import Draggable from "vuedraggable";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { Data } from "../../build/components/table/Table.vue";
import {
  AccessMode,
  type TableViewColumn,
  type TableViewListResponse,
} from "../../composables/table-view/types";
import {
  buildKanbanColumns,
  type KanbanColumnDef,
} from "../../composables/table-view/kanban";

const DEFAULT_COLUMN_PAGE_SIZE = 10;
const DEFAULT_COLUMN_MAX_HEIGHT = "60vh";
const DEFAULT_ROW_ID_KEY = "_id";
const NEUTRAL_DOT_COLOR = "var(--ui-color-neutral-400)";

interface BoardCellState {
  items: T[];
  total: number;
  loadingMore: boolean;
}

type ListResponse = TableViewListResponse<T>;

interface KanbanBoardProps {
  location: string;
  columns: TableViewColumn[];
  labelKey?: string;
  rowIdKey?: string;
  cardFields?: string[];
  cardComponent?: ComponentInfo;
  draggable?: boolean;
  /** Items fetched per column, shared with the table page size preference */
  columnPageSize?: number;
  /** CSS max-height of a column card list before it scrolls */
  columnMaxHeight?: string;
  /** Filters/search/sort query params shared with the table view */
  baseQuery: Record<string, unknown>;
  componentId?: string;
  pageId?: string;
  /** Edit action config; gates dragging globally and per row (rule) */
  editAction?: boolean | RowActionConfig;
  /** Delete action config; gates the default card delete button per row */
  deleteAction?: boolean | RowActionConfig;
}

const props = defineProps<KanbanBoardProps>();

const emit = defineEmits<{
  "card-click": [item: T];
  "card-delete": [item: T];
}>();

const groupByField = defineModel<string>("groupByField", { required: true });

const { $authFetch } = useAuthFetch();
const { processI18n, processApiMessage } = useTranslation();
const { getDataType } = useDataTypes();
const { locale, t } = useI18n();
const toast = useToast();

const rowIdKey = computed(() => props.rowIdKey ?? DEFAULT_ROW_ID_KEY);
const pageSize = computed(
  () => props.columnPageSize ?? DEFAULT_COLUMN_PAGE_SIZE,
);

const getRowId = (item: T): string | undefined => {
  const value = get(item, rowIdKey.value);
  if (value === undefined || value === null) return undefined;
  return String(value);
};

const groupColumn = computed(() =>
  props.columns.find((col) => col.accessorKey === groupByField.value),
);

const dotColor = (color?: string) =>
  color ? `var(--ui-${color})` : NEUTRAL_DOT_COLOR;

const boardColumns = computed<KanbanColumnDef[]>(() => {
  const column = groupColumn.value;
  if (!column) return [];
  return buildKanbanColumns(column, processI18n);
});

const cells = ref<Record<string, BoardCellState>>({});

const fetchColumnPage = (columnValue: string, offset: number) =>
  $authFetch<ListResponse>(`${props.location}/list`, {
    query: {
      ...props.baseQuery,
      [`filter_${groupByField.value}`]: `is:${columnValue}`,
      limit: pageSize.value,
      offset,
    },
  });

// Per-instance suffix: two boards with the same componentId/pageId on one
// page must not share the same useDmsAsyncData entry.
const instanceId = useId();

// Stable key so re-fetches only fire when the column set actually changes,
// not on every referential re-evaluation of the computed.
const boardColumnsKey = computed(() =>
  boardColumns.value.map((col) => col.value).join(","),
);

// Declared before the first await: Vue forbids defineExpose afterwards.
// `refresh` is assigned below and only called once setup has completed.
defineExpose({ refresh: () => refresh() });

const { data, status, refresh } = await useDmsAsyncData(
  `kanban-${props.componentId}-${props.pageId}-${instanceId}`,
  async () => {
    const pages = await Promise.all(
      boardColumns.value.map((col) => fetchColumnPage(col.value, 0)),
    );
    return Object.fromEntries(
      boardColumns.value.map((col, index) => [col.value, pages[index]]),
    );
  },
  { watch: [boardColumnsKey, () => props.baseQuery, pageSize] },
);

watch(
  data,
  (next) => {
    if (!next) return;
    cells.value = Object.fromEntries(
      Object.entries(next).map(([value, page]) => [
        value,
        {
          items: [...((page as ListResponse | undefined)?.results ?? [])],
          total: (page as ListResponse | undefined)?.total ?? 0,
          loadingMore: false,
        },
      ]),
    ) as Record<string, BoardCellState>;
  },
  { immediate: true },
);

const loadMore = async (col: KanbanColumnDef) => {
  const cell = cells.value[col.value];
  if (!cell || cell.loadingMore) return;
  cell.loadingMore = true;
  try {
    const page = await fetchColumnPage(col.value, cell.items.length);
    cell.items.push(...page.results);
    cell.total = page.total;
  } catch (error) {
    console.warn("[kanban] failed to load more items", error);
  } finally {
    cell.loadingMore = false;
  }
};

const hasMore = (col: KanbanColumnDef): boolean => {
  const cell = cells.value[col.value];
  return !!cell && cell.items.length < cell.total;
};

const isActionAllowedForItem = (
  action: boolean | RowActionConfig | undefined,
  item: T,
): boolean => {
  const config = normalizeActionConfig(action);
  if (!config.isEnabled) return false;
  if (!config.rule) return true;
  return evaluateRowActionRule(config.rule, item as Record<string, unknown>);
};

const isDragEnabled = computed(
  () =>
    (props.draggable ?? true) &&
    normalizeActionConfig(props.editAction).isEnabled,
);

const canDragItem = (item: T): boolean =>
  isActionAllowedForItem(props.editAction, item);

const canDeleteItem = (item: T): boolean =>
  isActionAllowedForItem(props.deleteAction, item);

interface DraggableChangeEvent {
  added?: { element: T; newIndex: number };
  removed?: { element: T; oldIndex: number };
}

// The edit route requires the full editable field set in the body (absent
// fields would fail the mandatory check or be blanked), so fetch the item and
// resubmit it like the edit form does: localized fields as records
// (x-content-language: "*"), values mapped through their type's
// beforeStateMapper (e.g. relation objects back to ids), readonly fields
// excluded.
const persistGroupChange = async (
  itemId: string,
  fieldKey: string,
  rawValue: unknown,
) => {
  const fullItem = await $authFetch<Record<string, unknown>>(
    `${props.location}/get`,
    {
      query: { id: itemId },
      headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
    },
  );

  const body: Record<string, unknown> = {};
  for (const column of props.columns) {
    if (column.accessMode === AccessMode.ReadOnly) continue;
    let value = fullItem[column.accessorKey];
    if (value === undefined) continue;
    const mapper = getDataType(column.type.id)?.beforeStateMapper;
    if (mapper) {
      value = mapper(value, column.type.inputComponent?.options);
    }
    body[column.accessorKey] = value;
  }
  body[fieldKey] = rawValue;

  await $authFetch(`${props.location}/edit`, {
    method: "put",
    query: { id: itemId },
    body,
    headers: { [CONTENT_LANGUAGE_HEADER]: "*" },
  });
};

// Serializes persist calls per item: a fast A → B → C drag must not let the
// second PUT read a stale snapshot while the first is still in flight.
const pendingMoves = new Map<string, Promise<void>>();

const applyOptimisticMove = (
  item: T,
  fieldKey: string,
  target: KanbanColumnDef,
) => {
  const previousValue = get(item, fieldKey);
  const source = boardColumns.value.find(
    (col) => col.value === String(previousValue),
  );

  (item as Record<string, unknown>)[fieldKey] = target.rawValue;
  const targetCell = cells.value[target.value];
  if (targetCell) targetCell.total += 1;
  const sourceCell = source ? cells.value[source.value] : undefined;
  if (sourceCell) sourceCell.total -= 1;
};

// Waits out moves of the same item queued after `current`, so the rollback
// refresh reads the final server state instead of racing the next persist
// call and rebuilding the board from a pre-move snapshot.
const awaitNewerMoves = async (itemId: string, current: Promise<void>) => {
  let newer = pendingMoves.get(itemId);
  while (newer && newer !== current) {
    await newer.catch(() => {});
    const next = pendingMoves.get(itemId);
    newer = next === newer ? undefined : next;
  }
};

interface MoveErrorPayload {
  data?: { message?: string };
  message?: string;
}

const notifyMoveError = (error: unknown) => {
  const err = error as MoveErrorPayload;
  const message = err?.data?.message || err?.message;
  toast.add({
    color: Color.error,
    title: t("dms.table.kanban.move_error"),
    description: message ? processApiMessage(message) : undefined,
  });
};

const onColumnChange = async (
  target: KanbanColumnDef,
  event: DraggableChangeEvent,
) => {
  const added = event.added;
  if (!added) return;

  const item = added.element;
  const itemId = getRowId(item);

  if (!itemId) {
    // No stable ID — the move cannot be persisted; refresh to undo the
    // local reorder vuedraggable already applied.
    await refresh();
    return;
  }

  // Captured synchronously: the queued persist call below may run after the
  // user has switched the group-by selector, and must not write to the new
  // field.
  const fieldKey = groupByField.value;
  applyOptimisticMove(item, fieldKey, target);

  const queued = (pendingMoves.get(itemId) ?? Promise.resolve())
    .catch(() => {})
    .then(() => persistGroupChange(itemId, fieldKey, target.rawValue));
  pendingMoves.set(itemId, queued);

  try {
    await queued;
    toast.add({
      color: Color.success,
      title: t("dms.table.kanban.move_success", { column: target.label }),
    });
  } catch (error) {
    notifyMoveError(error);
    await awaitNewerMoves(itemId, queued);
    await refresh();
  } finally {
    if (pendingMoves.get(itemId) === queued) pendingMoves.delete(itemId);
  }
};

const customCardComponent = computed(() => {
  const componentName = props.cardComponent?.componentName;
  if (!componentName) return undefined;
  return resolveDmsComponent(componentName) || componentName;
});

const cardColumns = computed(() =>
  (props.cardFields ?? [])
    .map((field) => props.columns.find((col) => col.accessorKey === field))
    .filter((col): col is TableViewColumn => !!col),
);

const getCardTitle = (item: T): string => {
  if (props.labelKey) {
    const label = get(item, props.labelKey);
    if (label !== undefined && label !== null && label !== "") {
      return String(label);
    }
  }
  return getRowId(item) ?? "";
};

// Renders a card field value the same way table cells do: through the
// formatter registered for the column's data type.
const FieldValue = (fieldProps: { column: TableViewColumn; item: T }) => {
  const value = get(fieldProps.item, fieldProps.column.accessorKey);
  const options = fieldProps.column.type.inputComponent?.options as
    | Record<string, unknown>
    | undefined;

  if (value === null || value === undefined) {
    return h("span", (options?.fallback as string) ?? "-");
  }

  const formatter = getDataType(fieldProps.column.type.id)?.formatter;
  const rendered = formatter
    ? formatter.default(value, locale.value, options)
    : value;

  if (typeof rendered === "string" || typeof rendered === "number") {
    return h("span", String(rendered));
  }
  return rendered as ReturnType<typeof h>;
};
</script>

<template>
  <div>
    <div
      v-if="boardColumns.length === 0"
      class="text-muted mt-4 text-center text-sm"
    >
      {{ t("dms.table.kanban.no_columns") }}
    </div>

    <div v-else class="mt-4 flex items-start gap-4 overflow-x-auto pb-2">
      <div
        v-for="col in boardColumns"
        :key="col.value"
        class="border-default bg-muted/40 flex w-72 shrink-0 flex-col rounded-lg border"
      >
        <div
          class="border-default flex items-center gap-2 border-b px-3 py-2.5"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: dotColor(col.color) }"
          />
          <span class="truncate text-sm font-semibold">{{ col.label }}</span>
          <UBadge
            color="neutral"
            variant="soft"
            size="sm"
            class="ml-auto shrink-0"
          >
            {{ cells[col.value]?.total ?? 0 }}
          </UBadge>
        </div>

        <div
          class="flex flex-col overflow-y-auto p-2"
          :style="{ maxHeight: columnMaxHeight ?? DEFAULT_COLUMN_MAX_HEIGHT }"
        >
          <USkeleton
            v-if="status === 'pending' && !cells[col.value]"
            class="h-20 w-full"
          />

          <Draggable
            v-else
            :list="cells[col.value]?.items ?? []"
            :group="`kanban-${componentId}`"
            :disabled="!isDragEnabled"
            :item-key="rowIdKey"
            filter=".kanban-card-locked"
            :prevent-on-filter="false"
            class="flex min-h-16 flex-col gap-2"
            ghost-class="opacity-50"
            @change="
              (event: DraggableChangeEvent) => onColumnChange(col, event)
            "
          >
            <template #item="{ element }">
              <div :class="{ 'kanban-card-locked': !canDragItem(element) }">
                <component
                  :is="customCardComponent"
                  v-if="customCardComponent"
                  :item="element"
                  :columns="columns"
                  :group-value="col.value"
                  v-bind="cardComponent?.options ?? {}"
                  @edit="emit('card-click', element)"
                  @delete="emit('card-delete', element)"
                />
                <div
                  v-else
                  class="border-default hover:border-primary group cursor-pointer rounded-lg border bg-(--dms-surface-card) p-3 transition-colors"
                  @click="emit('card-click', element)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <p class="truncate text-sm font-semibold">
                      {{ getCardTitle(element) }}
                    </p>
                    <UButton
                      v-if="canDeleteItem(element)"
                      icon="i-ph-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      square
                      class="-mt-1 -mr-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      :aria-label="t('dms.button.delete')"
                      @click.stop="emit('card-delete', element)"
                    />
                  </div>
                  <div
                    v-for="fieldColumn in cardColumns"
                    :key="fieldColumn.id"
                    class="text-muted mt-1.5 truncate text-xs"
                  >
                    <FieldValue :column="fieldColumn" :item="element" />
                  </div>
                </div>
              </div>
            </template>
          </Draggable>
        </div>

        <div v-if="hasMore(col)" class="px-2 pb-2">
          <UButton
            :label="t('dms.table.kanban.load_more')"
            :loading="cells[col.value]?.loadingMore"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            @click="loadMore(col)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
