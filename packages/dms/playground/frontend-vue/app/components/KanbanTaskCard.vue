<script setup lang="ts">
interface KanbanColumnMeta {
  id: string;
  header: string;
  accessorKey: string;
  type: { id: string; inputComponent?: { options?: unknown } };
}

// The card props every card display hands a custom card (`card.component`),
// mirrored locally so this example stays decoupled from the dms package's
// internal type paths.
interface TaskCardProps {
  /** The row the card stands for */
  row: Record<string, unknown>;
  /** Its id */
  rowId: string;
  /** Column metadata of the table view (types, labels) */
  columns: KanbanColumnMeta[];
  /** The table's row actions and their per-row predicates */
  actions: {
    canDeleteRow: (item: Record<string, unknown>) => boolean;
    delete: (ids: string[]) => void;
  };
  /** The row is selected */
  selected: boolean;
  /** Selects or unselects the row */
  select: (value?: boolean) => void;
  /** What a click on the row does in the grid */
  open: () => void;
  /** Value of the kanban column this card currently belongs to */
  groupValue?: string;
}

const props = defineProps<TaskCardProps>();

const { formatDate, formatPrice } = useRegionalFormat();

const PRIORITY_COLORS: Record<string, string> = {
  low: "neutral",
  medium: "warning",
  high: "error",
};

const priority = computed(() => String(props.row.priority ?? ""));
const completion = computed(() =>
  Math.round(Number(props.row.completion_percentage ?? 0) * 100),
);

const dueDate = computed(
  () =>
    formatDate(props.row.due_date || undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }) ?? undefined,
);

const price = computed(() => {
  const raw = props.row.price;
  if (raw === undefined || raw === null) return undefined;
  return String(formatPrice(Number(raw)));
});
</script>

<template>
  <div
    class="border-default bg-(--dms-surface-card) hover:border-primary group cursor-pointer rounded-lg border p-3 transition-colors"
    :class="{ 'border-primary ring-primary ring-1': selected }"
    @click="open()"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="truncate text-sm font-semibold">{{ row.name }}</p>
      <UBadge
        v-if="priority"
        :color="PRIORITY_COLORS[priority] ?? 'neutral'"
        variant="subtle"
        size="sm"
        class="shrink-0 capitalize"
      >
        {{ priority }}
      </UBadge>
    </div>

    <p class="text-primary mt-1 truncate text-xs">{{ row.email }}</p>

    <div class="text-muted mt-2 flex items-center gap-3 text-xs">
      <span v-if="dueDate" class="inline-flex items-center gap-1">
        <UIcon name="i-ph-calendar" class="size-3.5" />
        {{ dueDate }}
      </span>
      <span v-if="price">{{ price }}</span>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <UProgress :model-value="completion" size="sm" class="grow" />
      <span class="text-muted text-xs">{{ completion }}%</span>
    </div>

    <div class="mt-2 flex items-center justify-between">
      <UCheckbox
        :model-value="selected"
        :aria-label="String(row.name ?? rowId)"
        @click.stop
        @update:model-value="(value: unknown) => select(Boolean(value))"
      />
      <UButton
        v-if="actions.canDeleteRow(row)"
        icon="i-ph-trash"
        color="error"
        variant="ghost"
        size="xs"
        square
        class="opacity-0 transition-opacity group-hover:opacity-100"
        @click.stop="actions.delete([rowId])"
      />
    </div>
  </div>
</template>
