<script setup lang="ts">
import { computed } from "vue";
import type { TableLiveHoldReason } from "../../composables/table-view/useTableLiveHold";

/**
 * The strip of a `liveHold` table: "N new · Show" once events came in while
 * it holds, led by why it holds when it does so by itself, its page staying
 * live ("Table on hold · search active · 3 new · Show"). Show reads the rows
 * once; the hold stays.
 */
const props = withDefaults(
  defineProps<{
    /** Events the table received since its rows were held or last shown. */
    count: number;
    /** Why the table holds by itself, `null` while its page is paused. */
    reason?: TableLiveHoldReason | null;
  }>(),
  { reason: null },
);

const emit = defineEmits<{ show: [] }>();

const { t } = useI18n();

const REASON_KEYS: Record<TableLiveHoldReason, string> = {
  rowOpen: "dms.live.held_row_open",
  searching: "dms.live.held_searching",
  sorted: "dms.live.held_sorted",
  scrolled: "dms.live.held_scrolled",
};

const reasonText = computed(() =>
  props.reason
    ? `${t("dms.live.table_held")} · ${t(REASON_KEYS[props.reason])}`
    : "",
);
</script>

<template>
  <div
    role="status"
    class="dms-live-hold-banner text-highlighted flex items-center gap-2.5 border-b border-(--dms-info-line) bg-(--dms-info-tint) py-[7px] ps-[18px] pe-3.5 text-[13px]"
  >
    <UIcon name="i-ph-pause-circle" class="text-info size-4 shrink-0" />
    <span v-if="reasonText" class="dms-live-hold-banner__reason min-w-0">
      {{ reasonText }}
    </span>
    <template v-if="count > 0">
      <span v-if="reasonText" aria-hidden="true" class="text-muted">·</span>
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
    </template>
  </div>
</template>
