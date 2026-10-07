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
import { useServerRenderedAsyncData } from "../../build/composables/table-view/useServerRenderedAsyncData";
import type { TableViewDisplayContext } from "../../composables/table-view/types/display";
import {
  buildCardProps,
  cardFieldColumns,
} from "../../build/composables/table-view/utils/card";

const DEFAULT_COLUMN_PAGE_SIZE = 10;
const DEFAULT_COLUMN_MAX_HEIGHT = "60vh";
const DEFAULT_ROW_ID_KEY = "_id";
const NEUTRAL_DOT_COLOR = "var(--ui-color-neutral-400)";
// Placeholder cards per column while the board's first pages load.
const SKELETON_CARD_COUNT = 3;

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
  /**
   * What a custom card is handed besides its row: the table's actions and
   * selection (see `TableViewCardProps`).
   */
  cardContext?: Pick<
    TableViewDisplayContext<T>,
    "columns" | "labelKey" | "rowIdKey" | "actions" | "selection"
  >;
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

const { data, status, refresh } = await useServerRenderedAsyncData(
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

// Nothing fetched yet (a client navigation paints first): the columns hold
// placeholder cards and counts rather than an empty board.
const isBoardLoading = computed(
  () => data.value === null && status.value !== "error",
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

const remainingCount = (col: KanbanColumnDef): number => {
  const cell = cells.value[col.value];
  return cell ? Math.max(cell.total - cell.items.length, 0) : 0;
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
    normalizeActionConfig(props.editAction).isEnabled === true,
);

const canDragItem = (item: T): boolean =>
  isActionAllowedForItem(props.editAction, item);

const canDeleteItem = (item: T): boolean =>
  isActionAllowedForItem(props.deleteAction, item);

// A card its row rule keeps in place says so with a lock, on a board where
// the others move.
const isItemLocked = (item: T): boolean =>
  isDragEnabled.value && !canDragItem(item);

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

// A custom card gets the props a card of the cards display gets, plus the
// value of the column it sits in.
const customCardProps = (item: T, groupValue: string) => ({
  ...props.cardComponent?.options,
  ...(props.cardContext ? buildCardProps(item, props.cardContext) : {}),
  groupValue,
});

const customCardComponent = computed(() => {
  const componentName = props.cardComponent?.componentName;
  if (!componentName) return undefined;
  return resolveDmsComponent(componentName) || componentName;
});

// The cards grid's fields; the column a card sits in already says its group.
const cardColumns = computed(() =>
  cardFieldColumns(props.columns, props.cardFields, {
    labelKey: props.labelKey,
    rowIdKey: props.rowIdKey ?? DEFAULT_ROW_ID_KEY,
    others: [groupByField.value],
  }),
);

// The id line only adds something when the title is a label, not the id.
const getCardId = (item: T): string | undefined => {
  if (!props.labelKey) return undefined;
  const label = get(item, props.labelKey);
  if (label === undefined || label === null || label === "") return undefined;
  return getRowId(item);
};

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
      class="text-muted px-[18px] py-8 text-center text-sm"
    >
      {{ t("dms.table.kanban.no_columns") }}
    </div>

    <!-- v2 board: 240px columns on a muted band, inside the table card. -->
    <div
      v-else
      class="flex items-start gap-3 overflow-x-auto px-[18px] pt-4 pb-[18px]"
    >
      <div
        v-for="col in boardColumns"
        :key="col.value"
        class="border-default flex w-60 shrink-0 flex-col rounded-[10px] border bg-(--dms-bg-muted)/70"
      >
        <div
          class="border-default flex h-10 items-center gap-2 border-b ps-3 pe-2"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{
              backgroundColor: dotColor(col.color),
              boxShadow: `0 0 0 3px color-mix(in srgb, ${dotColor(col.color)} 12%, transparent)`,
            }"
          />
          <span class="text-highlighted truncate text-[13px] font-semibold">
            {{ col.label }}
          </span>
          <USkeleton
            v-if="isBoardLoading && !cells[col.value]"
            aria-hidden="true"
            class="ms-auto h-[16.5px] w-5 shrink-0 rounded-[5px]"
          />
          <span
            v-else
            class="bg-elevated text-muted ms-auto shrink-0 rounded-[5px] px-1.5 font-mono text-[11px] font-semibold tabular-nums"
          >
            {{ cells[col.value]?.total ?? 0 }}
          </span>
        </div>

        <div
          class="flex flex-col overflow-y-auto p-2"
          :style="{ maxHeight: columnMaxHeight ?? DEFAULT_COLUMN_MAX_HEIGHT }"
        >
          <div
            v-if="isBoardLoading && !cells[col.value]"
            aria-hidden="true"
            class="flex min-h-16 flex-col gap-2"
          >
            <div
              v-for="n in SKELETON_CARD_COUNT"
              :key="n"
              class="border-default grid gap-2 rounded-lg border bg-(--dms-surface-card) px-3 pt-2.5 pb-[11px] shadow-xs"
            >
              <div class="-mb-0.5 flex min-h-5 items-center">
                <USkeleton class="h-2.5 w-10" />
              </div>
              <div class="flex h-[17px] items-center">
                <USkeleton class="h-3 w-3/4" />
              </div>
              <div
                v-for="fieldColumn in cardColumns"
                :key="fieldColumn.id"
                class="-mt-0.5 flex h-[18px] items-center"
              >
                <USkeleton class="h-2.5 w-1/2" />
              </div>
            </div>
          </div>

          <Draggable
            v-else
            :list="cells[col.value]?.items ?? []"
            :group="`kanban-${componentId}`"
            :disabled="!isDragEnabled"
            :item-key="rowIdKey"
            filter=".kanban-card-locked"
            :prevent-on-filter="false"
            class="flex min-h-16 flex-col gap-2"
            ghost-class="dms-kanban-ghost"
            drag-class="dms-kanban-drag"
            @change="
              (event: DraggableChangeEvent) => onColumnChange(col, event)
            "
          >
            <template #item="{ element }">
              <div :class="{ 'kanban-card-locked': !canDragItem(element) }">
                <component
                  :is="customCardComponent"
                  v-if="customCardComponent"
                  :columns="columns"
                  v-bind="customCardProps(element, col.value)"
                  @edit="emit('card-click', element)"
                  @delete="emit('card-delete', element)"
                />
                <!-- v2 card: id line (with its delete or lock), title, fields. -->
                <div
                  v-else
                  class="border-default group hover:border-primary/35 grid cursor-pointer gap-2 rounded-lg border bg-(--dms-surface-card) px-3 pt-2.5 pb-[11px] text-[12.5px] shadow-xs transition-colors"
                  @click="emit('card-click', element)"
                >
                  <div
                    v-if="
                      getCardId(element) ||
                      canDeleteItem(element) ||
                      isItemLocked(element)
                    "
                    class="-mb-0.5 flex min-h-5 items-center gap-2"
                  >
                    <span
                      v-if="getCardId(element)"
                      class="text-muted truncate font-mono text-[11.5px] font-medium"
                    >
                      #{{ getCardId(element) }}
                    </span>
                    <UIcon
                      v-if="isItemLocked(element)"
                      name="i-ph-lock-simple"
                      class="text-dimmed ms-auto size-[13px] shrink-0"
                      :aria-label="t('dms.table.kanban.locked')"
                    />
                    <UButton
                      v-else-if="canDeleteItem(element)"
                      icon="i-ph-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      square
                      class="-my-1 ms-auto -me-1.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      :aria-label="t('dms.button.delete')"
                      @click.stop="emit('card-delete', element)"
                    />
                  </div>
                  <p
                    class="text-highlighted truncate text-[13px] leading-[1.3] font-semibold"
                  >
                    {{ getCardTitle(element) }}
                  </p>
                  <div
                    v-for="fieldColumn in cardColumns"
                    :key="fieldColumn.id"
                    class="text-muted -mt-0.5 truncate text-[12px]"
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
            :label="
              t('dms.table.kanban.load_more_count', {
                count: remainingCount(col),
              })
            "
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

<style>
/* SortableJS takes a single class name per state, hence plain CSS here.
   v2 drop target: a dashed, accent-tinted slot where the card will land. */
.dms-kanban-ghost {
  min-height: 58px;
  border: 1.5px dashed color-mix(in srgb, var(--ui-primary) 35%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
}
.dms-kanban-ghost > * {
  visibility: hidden;
}
/* The card being dragged tilts and lifts on an accent ring. */
.dms-kanban-drag > * {
  transform: rotate(-2deg);
  border-color: var(--ui-primary);
  box-shadow:
    var(--shadow-lg),
    0 0 0 1px var(--ui-primary);
}
</style>
