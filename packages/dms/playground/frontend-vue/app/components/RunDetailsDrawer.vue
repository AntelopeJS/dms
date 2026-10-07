<script setup lang="ts">
// The drawer of the "Views, grouped & cells" demo's "Run details" action: a
// row-click action opening a module's own component, which steps through
// the listed runs with its `navigation` prop (or J and K).

interface RunRow {
  name?: string;
  runId?: string;
  status?: string;
  lastError?: string;
  doneSteps?: number;
  totalSteps?: number;
  startedAt?: string;
}

interface RowNavigation {
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
}

interface Props {
  rowData?: RunRow;
  navigation?: RowNavigation;
}

const props = defineProps<Props>();

const { formatDateTime } = useRegionalFormat();

const startedAt = computed(
  () => formatDateTime(props.rowData?.startedAt) ?? "—",
);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div
      v-if="props.navigation"
      class="flex items-center justify-between gap-3 text-xs text-muted"
    >
      <span class="font-mono tabular-nums">
        {{ props.navigation.index + 1 }} / {{ props.navigation.total }}
      </span>
      <span class="flex items-center gap-1">
        <UKbd value="K" />
        <UKbd value="J" />
        <UButton
          icon="i-ph-caret-up"
          color="neutral"
          variant="outline"
          size="xs"
          square
          aria-label="Previous run"
          :disabled="!props.navigation.hasPrev"
          @click="props.navigation.prev()"
        />
        <UButton
          icon="i-ph-caret-down"
          color="neutral"
          variant="outline"
          size="xs"
          square
          aria-label="Next run"
          :disabled="!props.navigation.hasNext"
          @click="props.navigation.next()"
        />
      </span>
    </div>

    <div class="flex flex-col gap-1">
      <span class="font-mono text-xs text-dimmed">{{
        props.rowData?.runId
      }}</span>
      <h3 class="text-base font-semibold text-highlighted">
        {{ props.rowData?.name }}
      </h3>
    </div>

    <dl class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
      <dt class="text-muted">Status</dt>
      <dd class="text-highlighted capitalize">{{ props.rowData?.status }}</dd>
      <dt class="text-muted">Steps</dt>
      <dd class="font-mono tabular-nums">
        {{ props.rowData?.doneSteps }} / {{ props.rowData?.totalSteps }}
      </dd>
      <dt class="text-muted">Started</dt>
      <dd>{{ startedAt }}</dd>
      <template v-if="props.rowData?.lastError">
        <dt class="text-muted">Last error</dt>
        <dd class="text-error">{{ props.rowData.lastError }}</dd>
      </template>
    </dl>
  </div>
</template>
