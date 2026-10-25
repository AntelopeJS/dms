<script setup lang="ts">
import { computed, watch } from "vue";
import DmsEmptyState from "../empty-state/EmptyState.vue";
import DmsSaveBar from "../save-bar/SaveBar.vue";
import DmsBlockInlineStatus from "../../build/components/blocks/BlockInlineStatus.vue";
import MatrixFooter from "../../build/components/matrix/MatrixFooter.vue";
import MatrixGrid from "../../build/components/matrix/MatrixGrid.vue";
import MatrixToolbar from "../../build/components/matrix/MatrixToolbar.vue";
import { useMatrix } from "../../build/composables/matrix/useMatrix";
import { clampPage } from "../../build/composables/matrix/matrixQuery";
import {
  cellBackground,
  MATRIX_TONE_TINTS,
} from "../../build/composables/matrix/matrixTones";
import { readFetchNotFound } from "../../build/utils/fetchNotFound";
import { useComponentEvent } from "../../../../dms-core/app/composables/components/useComponentEvent";
import { useWatch } from "../../../../dms-core/app/composables/watch/useWatch";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import type { MatrixOptions } from "../../types/matrix";

// `Matrix` block (interface-dms `base/matrix`): a grid of rows by columns
// read and edited in place. The state and behaviour live in `useMatrix`, the
// parts under `build/components/matrix`; this file lays them out.
interface MatrixBlockProps extends DefaultComponentProps, MatrixOptions {}

// Every flag defaults to `undefined`, not `false`: the options read an
// absent flag as its own default (`editable` with a `saveUrl`, `urlState`).
const props = withDefaults(defineProps<MatrixBlockProps>(), {
  editable: undefined,
  typeToEdit: undefined,
  review: undefined,
  rowPanel: undefined,
  search: undefined,
  sortable: undefined,
  urlState: undefined,
  crossHighlight: undefined,
  columnsMenu: undefined,
  resizableColumns: undefined,
  jumpToEmpty: undefined,
  keepEditedRows: undefined,
  exportCsv: undefined,
  selectable: undefined,
  columnFilters: undefined,
});

useComponentEvent(props.componentId);
const { state: watchState } = useWatch(
  props.watchActions || [],
  props.componentId,
);

const matrix = useMatrix(props, () => JSON.stringify(watchState.value));
const { t } = useI18n();
const { source, engine, rows, query } = matrix;

const hasError = computed(
  () =>
    !source.isLoading.value &&
    !source.data.value &&
    Boolean(source.error.value),
);
const notFound = computed(() =>
  hasError.value ? readFetchNotFound(source.error.value) : null,
);
const isEmpty = computed(
  () =>
    !hasError.value &&
    !source.isLoading.value &&
    source.data.value !== null &&
    rows.rows.value.length === 0,
);
const isFiltered = computed(() => query.isFiltered());
const emptyTitle = computed(() => {
  if (isFiltered.value) return t("dms.matrix.no_match");
  return matrix.text(props.emptyLabel) || t("dms.matrix.empty");
});

// Rows deleted elsewhere can leave the page past the end.
watch(
  () => source.data.value?.total,
  (total) => {
    if (props.pagination !== "pages" || total === undefined || total === 0)
      return;
    const state = query.state.value;
    const page = clampPage(state.page, total, state.pageSize);
    if (page !== state.page) query.setPage(page);
  },
);

const isStaged = computed(() => props.saveMode === "staged");
const changedColumns = computed(() => [
  ...new Set(
    engine.edits.value.map((edit) => {
      const column = matrix.columns.columnById.value.get(edit.columnId);
      return column ? matrix.text(column.label) : edit.columnId;
    }),
  ),
]);
const saveLabel = computed(() =>
  t(
    props.review ? "dms.matrix.review_label" : "dms.matrix.save_label",
    { count: engine.count.value },
    engine.count.value,
  ),
);
const keptCount = computed(() => rows.keptIds.value.size);
const legend = computed(() => props.legend ?? []);
</script>

<template>
  <div
    data-dms-matrix
    :data-component-id="props.componentId"
    class="dms-card flex min-w-0 flex-col overflow-hidden"
  >
    <MatrixToolbar />

    <div
      v-if="keptCount > 0"
      class="border-default flex flex-wrap items-center gap-2 border-b bg-(--dms-info-tint) py-2 ps-[18px] pe-3.5 text-[13px]"
      role="status"
    >
      <UIcon name="i-ph-push-pin" class="text-info size-4" />
      <span class="text-default">
        {{ t("dms.matrix.edited_banner", { count: keptCount }, keptCount) }}
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        class="ms-auto"
        :label="t('dms.matrix.hide')"
        @click="rows.hideKept()"
      />
    </div>

    <DmsBlockInlineStatus
      v-if="hasError"
      :state="notFound ? 'not-found' : 'error'"
      :not-found="notFound"
      class="min-h-48 px-[18px]"
      @retry="source.refresh()"
    />
    <DmsEmptyState
      v-else-if="isEmpty"
      :variant="isFiltered ? 'no-result' : 'no-data'"
      size="sm"
      class="min-h-48 place-content-center"
      :title="emptyTitle"
      :description="isFiltered ? t('dms.matrix.no_match_hint') : undefined"
      :actions="
        isFiltered
          ? [
              {
                label: t('dms.matrix.clear_filters'),
                color: 'neutral',
                variant: 'outline',
                onClick: () => query.clearFilters(),
              },
            ]
          : undefined
      "
    />
    <MatrixGrid v-else />

    <div
      v-if="matrix.targetMessage.value || engine.heldCount.value > 0"
      class="border-default flex flex-wrap items-center gap-2 border-t bg-(--dms-error-tint) py-2 ps-[18px] pe-3.5 text-[13px]"
      role="alert"
    >
      <UIcon name="i-ph-scales" class="text-error size-4 shrink-0" />
      <span class="text-error font-medium">
        {{ matrix.targetMessage.value }}
      </span>
      <span v-if="matrix.isBlocked.value" class="text-muted">
        {{
          engine.heldCount.value > 0
            ? t(
                "dms.matrix.held",
                { count: engine.heldCount.value },
                engine.heldCount.value,
              )
            : t("dms.matrix.blocked")
        }}
      </span>
    </div>

    <ul
      v-if="legend.length"
      class="border-default text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-t py-2 ps-[18px] pe-3.5 text-xs"
    >
      <li
        v-for="(item, index) in legend"
        :key="index"
        class="flex items-center gap-1.5"
      >
        <span
          class="border-default size-3 shrink-0 rounded-[3px] border bg-(--dms-surface-card)"
          :style="
            cellBackground({
              tint: item.tone ? MATRIX_TONE_TINTS[item.tone] : undefined,
              isHatched: item.hatched,
            })
          "
          aria-hidden="true"
        />
        {{ matrix.text(item.label) }}
      </li>
    </ul>

    <div
      v-if="isStaged && engine.count.value > 0"
      class="border-default border-t py-2 ps-[18px] pe-3.5"
    >
      <DmsSaveBar
        variant="band"
        dirty
        :saving="engine.isSaving.value"
        :changes="changedColumns"
        :save-label="saveLabel"
        @discard="engine.discardAll()"
        @save="matrix.requestSave()"
      />
    </div>

    <MatrixFooter />
  </div>
</template>
