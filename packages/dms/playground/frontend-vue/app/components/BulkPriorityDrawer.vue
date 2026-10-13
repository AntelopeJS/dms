<script setup lang="ts">
// The drawer of the "Custom Row Actions" demo's bulk "Set priority" action:
// a `bulk` action opening a drawer hands it the `selection` prop (`ids`,
// `count`) instead of a row. Saving calls the table's own route with the
// ids, then `onSuccessCallback` closes the drawer and refreshes the table.

interface Selection {
  ids?: string[];
  count: number;
}

interface Props {
  selection?: Selection;
  onSuccessCallback?: () => void;
}

const props = defineProps<Props>();

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const ROUTE = "/api/tasks/custom-row-actions/set-priority";

const { $authFetch } = useAuthFetch();
const toast = useToast();

const priority = ref("high");
const saving = ref(false);

const save = async () => {
  const query = new URLSearchParams();
  for (const id of props.selection?.ids ?? []) query.append("ids", id);
  saving.value = true;
  try {
    await $authFetch(`${ROUTE}?${query}`, {
      method: "POST",
      body: { priority: priority.value },
    });
    props.onSuccessCallback?.();
  } catch {
    toast.add({ color: "error", title: "The priority could not be set" });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-muted text-sm">
      {{ props.selection?.count ?? 0 }} task(s) selected.
    </p>
    <UFormField label="Priority">
      <USelect v-model="priority" :items="PRIORITIES" class="w-48" />
    </UFormField>
    <UButton
      label="Set priority"
      icon="i-ph-check"
      class="self-start"
      :loading="saving"
      @click="save"
    />
  </div>
</template>
