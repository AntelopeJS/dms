<script setup lang="ts">
import { computed } from "vue";
import type { TableLiveHoldReason } from "../../composables/table-view/useTableLiveHold";
import type { ConfirmTranslate } from "../../composables/confirm/confirmDialogTexts";
import { missedRowsText, showLiveNote } from "../../composables/live/liveNotes";
import type { PageLiveNote } from "../../../types/live";

/**
 * The strip of a `liveHold` table: "N new · Show" once events came in while
 * it holds, led by why it holds when it does so by itself, its page staying
 * live ("Table on hold · search active · 3 new · Show"), and followed, while
 * the page is paused, by the breakdown a component gave the page ("12 new
 * requests · 2 in 5xx · Show"). Show reads the rows once; the hold stays.
 * `floating`, it is a pill laid over the top of the rows instead: what came
 * in while the user had the rows on screen, or the page paused, says so
 * without pushing them down.
 */
const props = withDefaults(
  defineProps<{
    /** Events the table received since its rows were held or last shown. */
    count: number;
    /** Why the table holds by itself, `null` while its page is paused. */
    reason?: TableLiveHoldReason | null;
    /** What the new rows are called, given `{count}`; "N new" without. */
    missedLabel?: string;
    /** The breakdown of what the paused page missed. */
    detail?: PageLiveNote | null;
    /** A pill over the rows, taking no room, in place of the strip. */
    floating?: boolean;
  }>(),
  { reason: null, missedLabel: undefined, detail: null, floating: false },
);

// Literal class strings (Tailwind extracts them).
const STRIP_CLASS =
  "border-b border-(--dms-info-line) bg-(--dms-info-tint) py-[7px] ps-[18px] pe-3.5 text-[13px]";
const PILL_CLASS =
  "rounded-full border border-(--dms-info-line) bg-(--ui-bg) py-1 ps-2.5 pe-3.5 text-[12.5px] shadow-md";

const emit = defineEmits<{ show: [] }>();

const { t } = useI18n();
const translate = t as ConfirmTranslate;

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

const countText = computed(() =>
  missedRowsText(props.count, props.missedLabel, translate),
);
const detailNote = computed(() =>
  props.detail ? showLiveNote(props.detail, translate) : null,
);
</script>

<template>
  <div
    role="status"
    class="dms-live-hold-banner text-highlighted flex items-center gap-2.5"
    :class="props.floating ? PILL_CLASS : STRIP_CLASS"
  >
    <UIcon name="i-ph-pause-circle" class="text-info size-4 shrink-0" />
    <span v-if="reasonText" class="dms-live-hold-banner__reason min-w-0">
      {{ reasonText }}
    </span>
    <template v-if="count > 0">
      <span v-if="reasonText" aria-hidden="true" class="text-muted">·</span>
      <span class="min-w-0">{{ countText }}</span>
      <template v-if="detailNote">
        <span aria-hidden="true" class="text-muted">·</span>
        <span
          class="dms-live-hold-banner__detail min-w-0"
          :class="detailNote.toneClass"
        >
          {{ detailNote.text }}
        </span>
      </template>
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
