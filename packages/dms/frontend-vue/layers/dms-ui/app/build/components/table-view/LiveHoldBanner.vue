<script setup lang="ts">
/**
 * The strip a `liveHold` table shows while its page is paused and events came
 * in: "N new · Show". Show reads the rows once; the page stays paused.
 */
defineProps<{
  /** Events the table received since its rows were held or last shown. */
  count: number;
}>();

const emit = defineEmits<{ show: [] }>();

const { t } = useI18n();
</script>

<template>
  <div
    role="status"
    class="dms-live-hold-banner text-highlighted flex items-center gap-2.5 border-b border-(--dms-info-line) bg-(--dms-info-tint) py-[7px] ps-[18px] pe-3.5 text-[13px]"
  >
    <UIcon name="i-ph-pause-circle" class="text-info size-4 shrink-0" />
    <span class="min-w-0">
      {{ t("dms.live.new_rows", { count }, count) }}
    </span>
    <span aria-hidden="true" class="text-muted">·</span>
    <UButton
      :label="t('dms.live.show_new')"
      color="neutral"
      variant="link"
      size="xs"
      class="p-0 font-medium"
      @click="emit('show')"
    />
  </div>
</template>
