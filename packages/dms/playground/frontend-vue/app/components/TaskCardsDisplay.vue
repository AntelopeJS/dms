<script setup lang="ts">
import DmsEmpty from "#dms-ui/app/build/components/table/Empty.vue";
import DmsPagination from "#dms-ui/app/build/components/table/Pagination.vue";
import DmsCardGridSkeleton from "#dms-ui/app/build/components/table-view/CardGridSkeleton.vue";
import type { TableViewDisplayContext } from "#dms-ui/app/composables/table-view/types";

type DisplayRow = TableViewDisplayContext["items"][number];
type DisplayValue = DisplayRow[string];

interface ColumnMeta {
  id: string;
  header: string;
  accessorKey: string;
  listable?: boolean;
  type?: { id: string; inputComponent?: { options?: unknown } };
}

interface DisplayContext {
  items: TableViewDisplayContext["items"];
  columns: ColumnMeta[];
  loading: boolean;
  pagination: { pageSize: number };
  labelKey?: string;
  rowIdKey: string;
  selection: {
    isSelected: (id: string) => boolean;
    toggle: (id: string, value?: boolean) => void;
  };
  actions: {
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    add: () => void;
    edit: (item: DisplayRow) => void;
    delete: (ids: string[]) => void;
    /** The custom row actions a row offers (their `rule` accepted). */
    customFor: (item: DisplayRow) => CustomRowAction[];
    /** Runs a custom row action on a row, as its grid menu entry does. */
    custom: (action: CustomRowAction, item?: DisplayRow) => void;
  };
}

interface CustomRowAction {
  id?: string;
  label: string;
  icon?: string;
}

const props = defineProps<{ context: DisplayContext }>();

const MAX_CARD_FIELDS = 4;
const INITIALS_LENGTH = 2;
const EMPTY_VALUE = "—";

const { locale } = useI18n();
const { processI18n } = useTranslation();
const { getDataType } = useDataTypes();

const getValue = (item: DisplayRow, path: string): DisplayValue =>
  path
    .split(".")
    .reduce<DisplayValue>(
      (acc, key) =>
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Configured dotted paths traverse unvalidated row values; preserving the existing unchecked property access.
        acc == null ? undefined : (acc as DisplayRow)[key],
      item,
    );

const rowId = (item: DisplayRow): string =>
  String(getValue(item, props.context.rowIdKey) ?? "");

const title = (item: DisplayRow): string => {
  const value = props.context.labelKey
    ? getValue(item, props.context.labelKey)
    : undefined;
  return value !== undefined && value !== null && value !== ""
    ? String(value)
    : rowId(item);
};

const initials = (item: DisplayRow): string =>
  title(item)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INITIALS_LENGTH)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

const fieldColumns = computed(() =>
  props.context.columns
    .filter(
      (col) =>
        col.listable !== false &&
        col.accessorKey !== props.context.labelKey &&
        col.accessorKey !== props.context.rowIdKey,
    )
    .slice(0, MAX_CARD_FIELDS),
);

const FieldValue = (fieldProps: {
  column: ColumnMeta;
  item: DisplayRow;
}) => {
  const value = getValue(fieldProps.item, fieldProps.column.accessorKey);
  if (value === null || value === undefined || value === "") {
    return h("span", { class: "text-dimmed" }, EMPTY_VALUE);
  }
  const typeId = fieldProps.column.type?.id;
  const formatter = typeId ? getDataType(typeId)?.formatter : undefined;
  const rendered = formatter
    ? formatter.default(
        value,
        locale.value,
        fieldProps.column.type?.inputComponent?.options,
      )
    : value;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Formatter results are unknown in the owning DataTypeFormatter contract; retain the existing primitive rendering branch.
  if (typeof rendered === "string" || typeof rendered === "number") {
    return h("span", { class: "truncate" }, String(rendered));
  }
  return rendered;
};

const openItem = (item: DisplayRow) => {
  if (props.context.actions.canEdit) props.context.actions.edit(item);
};
</script>

<template>
  <div>
    <!-- First page on its way: the shared card grid placeholder, its field
         labels sized like this card's. -->
    <DmsCardGridSkeleton
      v-if="context.loading && context.items.length === 0"
      :count="context.pagination.pageSize"
      :fields="fieldColumns.length"
      label-class="text-[10.5px]"
    />

    <DmsEmpty
      v-else-if="context.items.length === 0"
      :can-add-row="context.actions.canAdd"
    />

    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-3 px-[18px] pt-4 pb-[18px]"
    >
      <article
        v-for="item in context.items"
        :key="rowId(item)"
        class="group border-default hover:border-primary/35 @container relative rounded-[10px] border bg-(--ui-bg) p-3.5 text-[12.5px] transition-colors"
        :class="{
          'border-primary ring-primary ring-1': context.selection.isSelected(
            rowId(item),
          ),
          'cursor-pointer': context.actions.canEdit,
        }"
        @click="openItem(item)"
      >
        <header class="flex items-center gap-2.5">
          <span
            class="grid size-7 shrink-0 place-items-center rounded-[7px] font-mono text-[10.5px] font-bold"
            :class="
              context.selection.isSelected(rowId(item))
                ? 'bg-primary/15 text-primary'
                : 'bg-accented text-default'
            "
          >
            {{ initials(item) }}
          </span>
          <div class="min-w-0 flex-1">
            <div
              class="text-highlighted truncate text-[13px] font-semibold"
              :title="title(item)"
            >
              {{ title(item) }}
            </div>
            <div class="text-dimmed truncate font-mono text-[11px]">
              #{{ rowId(item) }}
            </div>
          </div>
          <UButton
            v-if="context.actions.canDelete"
            icon="i-ph-trash"
            color="error"
            variant="ghost"
            size="xs"
            square
            class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            @click.stop="context.actions.delete([rowId(item)])"
          />
          <UCheckbox
            :model-value="context.selection.isSelected(rowId(item))"
            :aria-label="title(item)"
            @click.stop
            @update:model-value="
              (value: unknown) =>
                context.selection.toggle(rowId(item), Boolean(value))
            "
          />
        </header>

        <!-- A phone-narrow card stacks its fields: two columns would clip
          every value. -->
        <dl
          class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 max-sm:@max-[16rem]:grid-cols-1"
        >
          <div v-for="col in fieldColumns" :key="col.id" class="min-w-0">
            <dt
              class="text-dimmed truncate font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase"
            >
              {{ processI18n(col.header) }}
            </dt>
            <dd class="text-default mt-0.5 flex min-w-0">
              <FieldValue :column="col" :item="item" />
            </dd>
          </div>
        </dl>

        <footer
          v-if="context.actions.customFor(item).length"
          class="mt-3 flex flex-wrap gap-1.5"
        >
          <UButton
            v-for="action in context.actions.customFor(item)"
            :key="action.id ?? action.label"
            :label="action.label"
            :icon="action.icon"
            color="neutral"
            variant="outline"
            size="xs"
            @click.stop="context.actions.custom(action, item)"
          />
        </footer>
      </article>
    </div>

    <DmsPagination />
  </div>
</template>
