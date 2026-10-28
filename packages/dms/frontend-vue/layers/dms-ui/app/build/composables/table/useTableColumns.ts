import type { Data, TableColumn } from "../../components/table/Table.vue";
import { upperFirst } from "scule";
import { useClipboard } from "@vueuse/core";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";
import { useActionConfirm } from "../confirm/useActionConfirm";

import type { ColumnConfig, TableColumnContext } from "./tableColumnTypes";

import {
  processColumn,
  addExpandColumn,
  addRowSelectionColumn,
} from "./tableColumnStructure";

import { addRowActionsColumn } from "./tableColumnActionSizing";

export type { LabeledColumn, TableStyleSlots } from "./tableColumnTypes";

export const useTableColumns = <T extends Data>(config: ColumnConfig<T>) => {
  const { t } = useI18n();
  const router = useDmsRouter();
  const toast = useToast();
  const appConfig = useDmsAppConfig();
  const { copy: copyToClipboard } = useClipboard({ legacy: true });

  const columnInfos: TableColumn<T>[] =
    config.columns ??
    Object.keys(config.data.value[0] ?? {}).map((accessorKey: string) => ({
      accessorKey,
      header: upperFirst(accessorKey),
    }));

  const { renderColumnValue, isNumericColumn } = useColumnValueRenderer();

  const columns = computed(() => {
    const processedColumns = [...columnInfos].map((col) =>
      processColumn(context, col),
    );
    addExpandColumn(context, processedColumns);
    addRowSelectionColumn(context, processedColumns);
    addRowActionsColumn(context, processedColumns);
    return processedColumns;
  });
  const { confirmAction } = useActionConfirm();
  const { processI18n } = useTranslation();
  const context: TableColumnContext<T> = {
    config,
    t,
    router,
    toast,
    appConfig,
    copyToClipboard,
    renderColumnValue,
    isNumericColumn,
    confirmAction,
    processI18n,
  };
  return { columns, columnInfos };
};
