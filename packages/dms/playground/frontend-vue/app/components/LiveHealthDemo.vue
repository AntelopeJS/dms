<script setup lang="ts">

interface Props {
  healthUrl: string;
  realtimeTopic: string;
  idleRefresh: number;
}

interface Health {
  requests: number;
  serverErrors: number;
  checkedAt: string;
}

interface BatchPayload {
  server5xx?: number;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { processApiMessage } = useTranslation();
const { formatRelativeTime } = useRegionalFormat();
const { data, refresh } = useApiData<Health>(props.healthUrl);

const { missed, refreshNow } = usePageLiveRefresh(() => void refresh(), {
  realtimeTopic: props.realtimeTopic,
  idleRefresh: props.idleRefresh,
});
const live = usePageLive();

const missedServerErrors = ref(0);

useRealtimeTopic(
  () => props.realtimeTopic,
  (event) => {
    if (!live.isPaused.value || !("payload" in event)) return;
    const payload: BatchPayload = (event.payload ?? {});
    if (!payload.server5xx) return;
    missedServerErrors.value += payload.server5xx;
    live.setMissedDetail({
      text: "$demo.blocks.live.in_5xx",
      params: { count: missedServerErrors.value },
      tone: "error",
    });
  },
);

watch(live.isPaused, (isPaused) => {
  if (!isPaused) missedServerErrors.value = 0;
});

const note = ref("");

const state = computed(() => {
  if (live.isPolling.value) return t("demo.blocks.live.polling");
  if (live.isPaused.value) return t("demo.blocks.live.paused");
  return t("demo.blocks.live.direct");
});

const pauseReason = computed(() => {
  const reason = live.pauseReason.value;
  return reason ? processApiMessage(reason.text, reason.params) : "—";
});

const lastUpdate = computed(() =>
  live.lastUpdatedAt.value ? formatRelativeTime(live.lastUpdatedAt.value) : "—",
);
</script>

<template>
  <DmsCard :title="t('demo.blocks.live.health_title')" :count="missed">
    <div class="flex flex-col gap-3 text-sm">
      <div class="flex items-center gap-2">
        <DmsStatusPill
          :tone="live.isPaused.value ? 'warning' : 'success'"
          :dot="live.isPaused.value ? 'static' : 'live'"
          :label="state"
        />
        <span class="text-muted">{{ pauseReason }}</span>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt class="text-muted">{{ t("demo.blocks.live.requests") }}</dt>
        <dd class="font-mono">{{ data?.requests ?? "…" }}</dd>
        <dt class="text-muted">5xx</dt>
        <dd class="font-mono">{{ data?.serverErrors ?? "…" }}</dd>
        <dt class="text-muted">{{ t("demo.blocks.live.missed") }}</dt>
        <dd class="font-mono">{{ missed }}</dd>
        <dt class="text-muted">{{ t("demo.blocks.live.updated") }}</dt>
        <dd>{{ lastUpdate }}</dd>
      </dl>
      <UInput
        v-model="note"
        size="sm"
        :placeholder="t('demo.blocks.live.note_placeholder')"
        @focus="live.hold('$demo.blocks.live.typing')"
        @blur="live.release()"
      />
      <UButton
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-ph-arrow-clockwise"
        :label="t('demo.blocks.live.read_now')"
        class="self-start"
        @click="refreshNow()"
      />
    </div>
  </DmsCard>
</template>
