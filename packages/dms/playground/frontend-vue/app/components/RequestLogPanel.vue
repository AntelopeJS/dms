<script setup lang="ts">

interface ServedRequest {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  at?: string;
  previousId?: string;
}

interface Props {
  rowData?: ServedRequest;
  showRow?: (row: ServedRequest | string) => Promise<void>;
}

const props = defineProps<Props>();

const toast = useToast();
const { formatDateTime } = useRegionalFormat();

const servedAt = computed(() => formatDateTime(props.rowData?.at) ?? "—");

const openPrevious = (id: string) =>
  props
    .showRow?.(id)
    .catch(() =>
      toast.add({ color: "error", title: "This request could not be opened" }),
    );
</script>

<template>
  <div class="flex flex-col gap-5">
    <dl class="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
      <dt class="text-muted">Request</dt>
      <dd class="font-mono">{{ props.rowData?.requestId }}</dd>
      <dt class="text-muted">Status</dt>
      <dd class="font-mono tabular-nums">{{ props.rowData?.status }}</dd>
      <dt class="text-muted">Duration</dt>
      <dd class="font-mono tabular-nums">{{ props.rowData?.durationMs }} ms</dd>
      <dt class="text-muted">Served</dt>
      <dd>{{ servedAt }}</dd>
    </dl>

    <UButton
      v-if="props.rowData?.previousId"
      label="Previous request on this route"
      icon="i-ph-clock-counter-clockwise"
      color="neutral"
      variant="outline"
      class="self-start"
      @click="openPrevious(props.rowData.previousId)"
    />
    <p v-else class="text-muted text-sm">
      The first request the log keeps on this route.
    </p>
  </div>
</template>
