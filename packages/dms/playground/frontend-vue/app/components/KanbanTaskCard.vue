<script setup lang="ts">
interface KanbanColumnMeta {
  id: string;
  header: string;
  accessorKey: string;
  type: { id: string; inputComponent?: { options?: unknown } };
}

interface KanbanTaskCardProps {
  /** Raw row data of the entry */
  item: Record<string, unknown>;
  /** Column metadata of the table view (types, labels) */
  columns: KanbanColumnMeta[];
  /** Value of the kanban column this card currently belongs to */
  groupValue: string;
}

const props = defineProps<KanbanTaskCardProps>();

const emit = defineEmits<{
  (e: "edit" | "delete"): void;
}>();

const { locale } = useI18n();

const PRIORITY_COLORS: Record<string, string> = {
  low: "neutral",
  medium: "warning",
  high: "error",
};

const priority = computed(() => String(props.item.priority ?? ""));
const completion = computed(() =>
  Math.round(Number(props.item.completion_percentage ?? 0) * 100),
);

const dueDate = computed(() => {
  const raw = props.item.due_date;
  if (!raw) return undefined;
  const date = new Date(raw as string);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(locale.value, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
});

const price = computed(() => {
  const raw = props.item.price;
  if (raw === undefined || raw === null) return undefined;
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: "EUR",
  }).format(Number(raw));
});
</script>

<template>
  <div
    class="border-default bg-(--dms-surface-card) hover:border-primary group cursor-pointer rounded-lg border p-3 transition-colors"
    @click="emit('edit')"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="truncate text-sm font-semibold">{{ item.name }}</p>
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

    <p class="text-primary mt-1 truncate text-xs">{{ item.email }}</p>

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

    <div class="mt-2 flex justify-end">
      <UButton
        icon="i-ph-trash"
        color="error"
        variant="ghost"
        size="xs"
        square
        class="opacity-0 transition-opacity group-hover:opacity-100"
        @click.stop="emit('delete')"
      />
    </div>
  </div>
</template>
