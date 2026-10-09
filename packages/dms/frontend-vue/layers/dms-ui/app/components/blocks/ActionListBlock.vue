<script setup lang="ts">
import { computed } from "vue";
import DmsCard from "../card/Card.vue";
import DmsListRow from "../list-row/ListRow.vue";
import DmsBlockStatus, {
  type BlockEmptyText,
} from "../../build/components/blocks/BlockStatus.vue";
import { useChartFetch } from "../../composables/chart/useChartFetch";
import { useRecordActions } from "../../build/composables/actions/useRecordActions";
import { recordActionState } from "../../build/utils/recordConditions";
import { DMS_TONE_TEXT, isDmsTone } from "../../build/utils/tone";
import type { RecordAction, RecordData } from "../../types/record-action";
import type { Tone } from "../../types/tone";
import { refreshPageBlocks } from "../../utils/blockRefresh";
import { usePageRecord } from "../../../../dms-core/app/build/composables/page/usePageRecord";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";

// `ActionList` block (interface-dms `base/action-list`): what can be done to
// the record a page shows, one row per action, each running its target as a
// page header button does. The record is read from `fetchUrl`, or is the one
// the page header loaded; `when` hides a row and `unavailableWhen` disables
// it, its reason in place of its description.
interface ActionListBlockProps extends DefaultComponentProps {
  title?: string;
  actions?: RecordAction[];
  fetchUrl?: string;
  /** Card surface around the list; off when it sits inside a Card block. */
  card?: boolean;
  /** Shown when no action is left to list. */
  empty?: BlockEmptyText;
}

interface ActionRow {
  key: string;
  action: RecordAction;
  title: string;
  description?: string;
  tone: Tone | "muted";
  titleClass?: string;
  isDisabled: boolean;
}

const props = withDefaults(defineProps<ActionListBlockProps>(), {
  title: undefined,
  actions: () => [],
  fetchUrl: undefined,
  card: true,
  empty: undefined,
});

const ROW_CLASS =
  "w-full text-left disabled:cursor-not-allowed disabled:opacity-60";
const CHEVRON_ICON = "i-ph-caret-right";

const { processI18n } = useTranslation();
const pageRecord = usePageRecord();
const own = useChartFetch<RecordData>({
  fetchUrl: props.fetchUrl,
  routeParams: () => props.routeParams,
});
const { runRecordAction } = useRecordActions({
  componentId: props.componentId,
  pageId: props.pageId,
  routeParams: () => props.routeParams,
});

const record = computed(() =>
  props.fetchUrl ? own.data.value : pageRecord.record.value,
);
const isPending = computed(() =>
  props.fetchUrl
    ? own.isLoading.value && !own.data.value
    : pageRecord.isLoading.value,
);
const hasError = computed(() =>
  props.fetchUrl
    ? !!own.error.value && !own.data.value
    : pageRecord.hasError.value,
);

function toRow(action: RecordAction, index: number): ActionRow | null {
  const state = recordActionState(action, record.value);
  if (!state.isVisible) return null;
  const color = action.color && isDmsTone(action.color) ? action.color : null;
  const line =
    state.isDisabled && state.disabledReason
      ? state.disabledReason
      : action.description;
  return {
    key: action.id ?? String(index),
    action,
    title: processI18n(action.label),
    description: line ? processI18n(line) : undefined,
    tone: color && color !== "neutral" ? color : "muted",
    titleClass: color && color !== "neutral" ? DMS_TONE_TEXT[color] : undefined,
    isDisabled: state.isDisabled,
  };
}

const rows = computed(() =>
  props.actions.map(toRow).filter((row): row is ActionRow => row !== null),
);
const isEmpty = computed(
  () => !isPending.value && !hasError.value && rows.value.length === 0,
);
const title = computed(() =>
  props.title ? processI18n(props.title) : undefined,
);

// The page's record is the header's: refreshing the page reads it again.
const retry = () => (props.fetchUrl ? own.refresh() : refreshPageBlocks());

const runRow = (row: ActionRow) => {
  if (row.isDisabled) return;
  runRecordAction(row.action, record.value);
};
</script>

<template>
  <component
    :is="props.card ? DmsCard : 'div'"
    v-bind="props.card ? { padded: false, title } : {}"
  >
    <div v-if="isPending" class="flex flex-col gap-3 p-[18px]">
      <USkeleton
        v-for="index in props.actions.length || 1"
        :key="index"
        class="h-10 w-full"
      />
    </div>
    <DmsBlockStatus
      v-else-if="hasError"
      state="error"
      :card="false"
      @retry="retry"
    />
    <DmsBlockStatus
      v-else-if="isEmpty"
      state="empty"
      :card="false"
      :empty="props.empty"
    />
    <template v-else>
      <DmsListRow
        v-for="row in rows"
        :key="row.key"
        as="button"
        type="button"
        :class="ROW_CLASS"
        :icon="row.action.icon"
        :tone="row.tone"
        :description="row.description"
        :interactive="!row.isDisabled"
        :disabled="row.isDisabled"
        :data-action="row.key"
        @click="runRow(row)"
      >
        <span :class="row.titleClass">{{ row.title }}</span>
        <template #trailing>
          <UIcon
            v-if="!row.isDisabled"
            :name="CHEVRON_ICON"
            class="text-dimmed size-4"
          />
        </template>
      </DmsListRow>
    </template>
  </component>
</template>
