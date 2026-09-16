<script setup lang="ts">
import { isActionEnabled } from "#dms-core/app/utils/row-action-rule-evaluator";
import type { RowSelectionState } from "@tanstack/vue-table";
import type { TableRowActionOptions, Data } from "./Table.vue";
import { useTableContext } from "../../composables/table/useTableContext";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

const theme = tv({
  slots: {
    base: "bg-default bottom- absolute left-8 z-20",
    select: "text-primary",
  },
});

interface TableRowSelectionProps {
  rowActions?: TableRowActionOptions;
  canExport?: boolean;
}

defineProps<TableRowSelectionProps>();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableRowSelection: Partial<typeof theme> };
};

const { t } = useI18n();

const rowSelectionState = defineModel<RowSelectionState>("rowSelection", {
  default: (): RowSelectionState => ({}),
});

const tableSharedData = useTableContext<Data>();

const onDeleteSelection = () => {
  tableSharedData?.emits("delete", Object.keys(rowSelectionState.value));
  rowSelectionState.value = {};
};

const onExportSelection = () => {
  tableSharedData?.emits("export", Object.keys(rowSelectionState.value));
  rowSelectionState.value = {};
};

const uiTableRowSelectionVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableRowSelection || {}),
});
const uiTableRowSelection = computed(() => uiTableRowSelectionVariant());
</script>

<template>
  <section class="relative">
    <UFieldGroup
      v-if="Object.keys(rowSelectionState).length"
      :class="uiTableRowSelection.base()"
    >
      <UButton
        :label="
          t('dms.table.row_selections', {
            length: Object.keys(rowSelectionState).length,
          })
        "
        color="neutral"
        variant="outline"
        :ui="{ base: uiTableRowSelection.select() }"
        @click="rowSelectionState = {}"
      />
      <UButton
        v-if="canExport"
        :label="t('dms.button.export_data')"
        leading-icon="i-ph-export"
        leading
        color="neutral"
        variant="outline"
        @click="onExportSelection"
      />
      <UButton
        v-if="isActionEnabled(rowActions?.delete)"
        :label="t('dms.button.delete')"
        leading-icon="i-ph-trash"
        leading
        color="neutral"
        variant="outline"
        @click="onDeleteSelection"
      />
    </UFieldGroup>
  </section>
</template>
