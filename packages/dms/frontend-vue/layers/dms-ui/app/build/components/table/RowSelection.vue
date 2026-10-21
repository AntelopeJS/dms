<script setup lang="ts">
import { isActionEnabled } from "#dms-core/app/utils/row-action-rule-evaluator";
import type { RowSelectionState } from "@tanstack/vue-table";
import type { TableRowActionOptions, Data } from "./Table.vue";
import { useTableContext } from "../../composables/table/useTableContext";
import { selectedRowIds } from "../../composables/table-view/utils/bulkActions";
import { isAllMatchingAction } from "../../composables/actions/bulkSelection";
import type { CustomRowAction } from "../../../types/row-action";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

// v2 bulk bar: an accent-tinted band across the card, between the chrome and
// the column headers: a page checkbox, "n of page selected" and the bulk
// actions. In archive mode it turns amber and offers restore instead.
const theme = tv({
  slots: {
    base: "flex min-h-11 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-(--dms-accent-line) bg-linear-to-r from-(--dms-accent-tint-strong) to-(--dms-accent-tint) to-60% py-1.5 ps-[18px] pe-3.5 text-[13px]",
    count: "inline-flex items-center gap-2.5 font-semibold text-highlighted",
    countNumber: "font-mono tabular-nums text-primary",
    // Phones keep the count and the clear button on the first line, the
    // actions wrapping on a line of their own below.
    actions:
      "ms-auto flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:empty:hidden max-sm:ms-0 max-sm:w-full",
    clear: "text-muted hover:text-highlighted max-sm:ms-auto sm:-ms-1",
    selectAll: "font-medium text-primary hover:underline",
  },
  variants: {
    archived: {
      true: {
        base: "border-(--dms-warning-line) from-(--dms-warning-tint) to-transparent to-70%",
        countNumber: "text-warning",
      },
    },
  },
});

interface TableRowSelectionProps {
  rowActions?: TableRowActionOptions;
  /** Custom actions offered on the bar (backend `bulk`). */
  bulkActions?: CustomRowAction[];
  /** Rows the table's filters match, every page included. */
  total?: number;
  canExport?: boolean;
  /** The table lists archived rows: restore replaces archive and export. */
  archived?: boolean;
}

const props = defineProps<TableRowSelectionProps>();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableRowSelection: Partial<typeof theme> };
};

const { t, locale } = useI18n();
const { processI18n } = useTranslation();

const rowSelectionState = defineModel<RowSelectionState>("rowSelection", {
  default: (): RowSelectionState => ({}),
});
// Every row the filters match is selected, not only the ones ticked.
const allMatching = defineModel<boolean>("allMatching", { default: false });

const tableSharedData = useTableContext<Data>();

// Every selected row, other pages included: a bulk action covers them all.
const selectedIds = computed(() => selectedRowIds(rowSelectionState.value));
const selectedCount = computed(() => selectedIds.value.length);
const pageRowCount = computed(
  () => tableSharedData?.table.getRowModel().rows.length ?? 0,
);
const isWholePageSelected = computed(
  () => !!tableSharedData?.table.getIsAllPageRowsSelected(),
);

const clearSelection = () => {
  allMatching.value = false;
  rowSelectionState.value = {};
};

// The bar's checkbox completes the page selection, or clears it once full.
const togglePageSelection = () => {
  if (isWholePageSelected.value) {
    clearSelection();
    return;
  }
  tableSharedData?.table.toggleAllPageRowsSelected(true);
};

// Delete, archive and restore ask first: the table drops the rows from the
// selection once the action went through, a cancelled one keeps it. An export
// asks nothing and is done with the selection.
const emitForSelection = (
  event: "delete" | "archive" | "restore" | "export",
) => {
  tableSharedData?.emits(event, selectedIds.value);
  if (event === "export") clearSelection();
};

// Rows selected on other pages (or gone since) are not among the page's:
// "3 of 2 selected" would read as nonsense, so the count then stands alone.
const isSelectionWithinPage = computed(() => {
  const pageIds = new Set(
    tableSharedData?.table.getRowModel().rows.map((row) => row.id) ?? [],
  );
  return selectedIds.value.every((id) => pageIds.has(id));
});

const canArchive = computed(
  () => !props.archived && isActionEnabled(props.rowActions?.archive),
);
const canRestore = computed(
  () => !!props.archived && isActionEnabled(props.rowActions?.restore),
);
const canExportSelection = computed(() => !props.archived && props.canExport);
const canDelete = computed(() => isActionEnabled(props.rowActions?.delete));

const matchingTotal = computed(() => props.total ?? 0);
// Only actions able to find the rows themselves (and the export, which
// runs on the whole query) reach the rows of other pages.
const allMatchingActions = computed(() =>
  (props.bulkActions ?? []).filter(isAllMatchingAction),
);
const canSelectAllMatching = computed(
  () =>
    !allMatching.value &&
    isWholePageSelected.value &&
    matchingTotal.value > selectedCount.value &&
    (allMatchingActions.value.length > 0 || canExportSelection.value),
);
const shownBulkActions = computed(() =>
  allMatching.value ? allMatchingActions.value : (props.bulkActions ?? []),
);
const runBulkAction = (action: CustomRowAction) =>
  tableSharedData?.emits("bulkAction", action);
const exportShown = () => {
  if (!allMatching.value) {
    emitForSelection("export");
    return;
  }
  tableSharedData?.emits("exportAll");
  clearSelection();
};

const formattedTotal = computed(() =>
  new Intl.NumberFormat(locale.value).format(matchingTotal.value),
);

const uiTableRowSelectionVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableRowSelection || {}),
});
const uiTableRowSelection = computed(() =>
  uiTableRowSelectionVariant({ archived: !!props.archived }),
);
</script>

<template>
  <section v-if="selectedCount" :class="uiTableRowSelection.base()">
    <span :class="uiTableRowSelection.count()">
      <UCheckbox
        :model-value="isWholePageSelected ? true : 'indeterminate'"
        :aria-label="t('dms.table.select_page')"
        @update:model-value="togglePageSelection"
      />
      <i18n-t
        v-if="allMatching"
        keypath="dms.table.all_matching_selected"
        :plural="matchingTotal"
        scope="global"
        tag="span"
      >
        <template #count>
          <span :class="uiTableRowSelection.countNumber()">
            {{ formattedTotal }}
          </span>
        </template>
      </i18n-t>
      <i18n-t
        v-else
        :keypath="
          isSelectionWithinPage
            ? 'dms.table.row_selection_count'
            : 'dms.table.row_selection_count_only'
        "
        :plural="selectedCount"
        scope="global"
        tag="span"
      >
        <template #count>
          <span :class="uiTableRowSelection.countNumber()">
            {{ selectedCount }}
          </span>
        </template>
        <template #total>{{ pageRowCount }}</template>
      </i18n-t>
    </span>
    <button
      v-if="canSelectAllMatching"
      type="button"
      :class="uiTableRowSelection.selectAll()"
      @click="allMatching = true"
    >
      {{ t("dms.table.select_all_matching", { count: formattedTotal }) }}
    </button>

    <div :class="uiTableRowSelection.actions()">
      <UButton
        v-if="canExportSelection"
        :label="t('dms.button.export_data')"
        icon="i-ph-export"
        color="neutral"
        variant="outline"
        size="sm"
        @click="exportShown"
      />
      <UButton
        v-for="action in shownBulkActions"
        :key="action.label"
        :label="processI18n(action.label)"
        :icon="action.icon"
        :color="action.color ?? 'neutral'"
        variant="outline"
        size="sm"
        @click="runBulkAction(action)"
      />
      <UButton
        v-if="canArchive && !allMatching"
        :label="t('dms.button.archive')"
        icon="i-ph-archive"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emitForSelection('archive')"
      />
      <UButton
        v-if="canRestore && !allMatching"
        :label="t('dms.button.restore')"
        icon="i-ph-arrow-counter-clockwise"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emitForSelection('restore')"
      />
      <UButton
        v-if="canDelete && !allMatching"
        :label="
          archived ? t('dms.table.delete_permanently') : t('dms.button.delete')
        "
        icon="i-ph-trash"
        color="error"
        variant="outline"
        size="sm"
        @click="emitForSelection('delete')"
      />
    </div>
    <UButton
      :icon="appConfig.ui.icons.close"
      :aria-label="t('dms.table.clear_selection')"
      color="neutral"
      variant="ghost"
      size="sm"
      square
      :class="uiTableRowSelection.clear()"
      @click="clearSelection"
    />
  </section>
</template>
