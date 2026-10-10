<script setup lang="ts" generic="T extends Record<string, unknown>">
import { get } from "@nuxt/ui/runtime/utils/index.js";
import TablePagination from "../table/Pagination.vue";
import TableEmpty from "../table/Empty.vue";
import CardGridSkeleton from "./CardGridSkeleton.vue";
import type { TableViewColumn } from "../../../composables/table-view/types/column";
import type {
  TableViewCardConfig,
  TableViewCardReorder,
  TableViewDisplayContext,
} from "../../../composables/table-view/types/display";
import {
  buildCardProps,
  cardFieldColumns,
} from "../../composables/table-view/utils/card";
import {
  REORDER_HANDLE_CLASS,
  useReorderHandles,
} from "../../composables/table-view/useReorderHandles";

interface CardsDisplayProps {
  context: TableViewDisplayContext<T>;
}

const props = defineProps<CardsDisplayProps>();

const INITIALS_LENGTH = 2;
const EMPTY_VALUE = "—";

const { locale } = useI18n();
const { processI18n } = useTranslation();
const { getDataType } = useDataTypes();

const rowId = (item: T): string =>
  String(get(item, props.context.rowIdKey) ?? "");

const titleOf = (item: T): string => {
  const label = props.context.labelKey
    ? get(item, props.context.labelKey)
    : undefined;
  return label !== undefined && label !== null && label !== ""
    ? String(label)
    : rowId(item);
};

const initialsOf = (item: T): string =>
  titleOf(item)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const card = computed(
  () =>
    (props.context.options as { card?: TableViewCardConfig } | undefined)?.card,
);

// A custom card draws the whole card; it gets the props a kanban card gets.
const cardComponent = computed(() => {
  const name = card.value?.component?.componentName;
  return name ? resolveDmsComponent(name) || name : undefined;
});

const fieldColumns = computed<TableViewColumn[]>(() =>
  cardFieldColumns(props.context.columns, card.value?.fields, {
    labelKey: props.context.labelKey,
    rowIdKey: props.context.rowIdKey,
  }),
);

// A field renders the same way a table cell does: through the formatter of
// the column's data type (status pills, links, dates…).
const FieldValue = (fieldProps: { column: TableViewColumn; item: T }) => {
  const value = get(fieldProps.item, fieldProps.column.accessorKey);
  if (value === null || value === undefined || value === "") {
    return h("span", { class: "text-dimmed" }, EMPTY_VALUE);
  }
  const options = fieldProps.column.type.inputComponent?.options as
    | Record<string, unknown>
    | undefined;
  const formatter = getDataType(fieldProps.column.type.id)?.formatter;
  const rendered = formatter
    ? formatter.default(value, locale.value, options)
    : value;
  if (typeof rendered === "string" || typeof rendered === "number") {
    return h("span", { class: "truncate" }, String(rendered));
  }
  return rendered as ReturnType<typeof h>;
};

const openItem = (item: T) => props.context.actions.open(item);

// A hand-ordered table (backend `reorder`): each card carries a move handle,
// and is where another card dragged by its handle drops.
const { draggedIndex, handleFor, drop, allowDrop } = useReorderHandles({
  reorder: () => props.context.reorder,
  count: () => props.context.items.length,
});

const cardReorder = (index: number): TableViewCardReorder | undefined =>
  props.context.reorder
    ? {
        enabled: props.context.reorder.enabled,
        dragging: draggedIndex.value === index,
        handle: handleFor(index),
      }
    : undefined;
</script>

<template>
  <div>
    <!-- v2 cards display: an auto-fill grid inside the table card, sharing
         its selection and its pagination footer. -->
    <CardGridSkeleton
      v-if="props.context.loading && props.context.items.length === 0"
      :count="props.context.pagination.pageSize"
      :fields="fieldColumns.length"
    />

    <TableEmpty
      v-else-if="props.context.items.length === 0"
      :can-add-row="props.context.actions.canAdd"
    />

    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <template v-if="cardComponent">
        <!-- A wrapper out of the grid's layout, catching the drop on the
             card whatever its root element. -->
        <div
          v-for="(item, index) in props.context.items"
          :key="rowId(item)"
          class="contents"
          @dragover="allowDrop"
          @drop="drop(index)"
        >
          <component
            :is="cardComponent"
            v-bind="{
              ...(card?.component?.options ?? {}),
              ...buildCardProps(item, props.context),
              reorder: cardReorder(index),
            }"
          />
        </div>
      </template>
      <template v-else>
        <article
          v-for="(item, index) in props.context.items"
          :key="rowId(item)"
          class="group border-default hover:border-primary/35 @container cursor-pointer rounded-[10px] border bg-(--ui-bg) p-3.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-(--dms-accent-line)"
          :class="{
            'border-primary ring-primary ring-1':
              props.context.selection.isSelected(rowId(item)),
            'opacity-50': draggedIndex === index,
          }"
          tabindex="0"
          @click="openItem(item)"
          @keydown.enter.self="openItem(item)"
          @dragover="allowDrop"
          @drop="drop(index)"
        >
          <header class="flex items-center gap-2.5">
            <button
              v-if="props.context.reorder"
              v-bind="handleFor(index)"
              :class="['-ms-1.5', REORDER_HANDLE_CLASS]"
            >
              <UIcon name="i-ph-dots-six-vertical" />
            </button>
            <span
              class="bg-accented text-default grid size-7 shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px] font-bold"
            >
              {{ initialsOf(item) }}
            </span>
            <div class="min-w-0 flex-1">
              <div
                class="text-highlighted truncate text-[13px] font-semibold"
                :title="titleOf(item)"
              >
                {{ titleOf(item) }}
              </div>
              <div class="text-dimmed truncate font-mono text-[11px]">
                {{ rowId(item) }}
              </div>
            </div>
            <UCheckbox
              :model-value="props.context.selection.isSelected(rowId(item))"
              :aria-label="titleOf(item)"
              @click.stop
              @update:model-value="
                props.context.selection.toggle(rowId(item), !!$event)
              "
            />
          </header>

          <!-- A phone-narrow card stacks its fields: two columns would clip
          every value. -->
          <dl
            class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 max-sm:@max-[16rem]:grid-cols-1"
          >
            <div
              v-for="column in fieldColumns"
              :key="column.id"
              class="min-w-0"
            >
              <DmsEyebrow
                as="dt"
                truncate
                :label="processI18n(column.header)"
              />
              <dd class="text-default mt-0.5 flex min-w-0">
                <FieldValue :column="column" :item="item" />
              </dd>
            </div>
          </dl>
        </article>
      </template>
    </div>

    <TablePagination />
  </div>
</template>
