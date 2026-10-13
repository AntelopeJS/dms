<script setup lang="ts">
// The modal of the "Custom Row Actions" demo's "Open in a modal" action: a
// custom row action whose target is a `modal` hands its component the row.

interface TaskRow {
  name?: string;
  email?: string;
  status?: string;
  priority?: string;
  due_date?: string;
}

const props = defineProps<{ rowData?: TaskRow }>();

const { formatDate } = useRegionalFormat();

const dueDate = computed(() => formatDate(props.rowData?.due_date) ?? "—");
</script>

<template>
  <dl class="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
    <dt class="text-muted">Task</dt>
    <dd class="text-highlighted font-semibold">{{ props.rowData?.name }}</dd>
    <dt class="text-muted">Owner</dt>
    <dd>{{ props.rowData?.email }}</dd>
    <dt class="text-muted">Status</dt>
    <dd class="capitalize">{{ props.rowData?.status?.replace("_", " ") }}</dd>
    <dt class="text-muted">Priority</dt>
    <dd class="capitalize">{{ props.rowData?.priority }}</dd>
    <dt class="text-muted">Due</dt>
    <dd>{{ dueDate }}</dd>
  </dl>
</template>
