import { injectLocal } from "@vueuse/core";
import type { ShallowRef } from "vue";
import type { Data, TableSharedData } from "../../components/table/Table.vue";

const CONFIG_VERSION = 1;
const TOAST_DURATION_MS = 3000;

interface SerializedTableConfig {
  v: typeof CONFIG_VERSION;
  search?: string;
  filters: unknown[];
  order: string[];
  visibility: Record<string, boolean>;
  pinning: { left?: string[]; right?: string[] };
  sorting: unknown[];
  pagination: { pageIndex: number; pageSize: number };
}

const isSerializedConfig = (value: unknown): value is SerializedTableConfig => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { v?: unknown };
  return candidate.v === CONFIG_VERSION;
};

const encodeConfig = (config: SerializedTableConfig): string => {
  const json = JSON.stringify(config);
  if (typeof window === "undefined") return json;
  return window.btoa(unescape(encodeURIComponent(json)));
};

const decodeConfig = (code: string): SerializedTableConfig => {
  const trimmed = code.trim();
  const json =
    typeof window === "undefined"
      ? trimmed
      : decodeURIComponent(escape(window.atob(trimmed)));
  const parsed = JSON.parse(json);
  if (!isSerializedConfig(parsed)) {
    throw new Error("invalid_config");
  }
  return parsed;
};

export const useTableConfigClipboard = <T extends Data>() => {
  const tableSharedData =
    injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
  const toast = useToast();
  const { t } = useI18n();

  const buildConfig = (): SerializedTableConfig | null => {
    const data = tableSharedData?.value;
    if (!data) return null;

    return {
      v: CONFIG_VERSION,
      search: data.globalFilterState.value,
      filters: data.columnFiltersState.value,
      order: data.columnOrderState.value,
      visibility: data.columnVisibilityState.value,
      pinning: data.columnPinningState.value,
      sorting: data.sortingState.value,
      pagination: data.paginationState.value,
    };
  };

  const applyConfig = (config: SerializedTableConfig) => {
    const data = tableSharedData?.value;
    if (!data) return;

    data.globalFilterState.value = config.search ?? "";
    data.columnFiltersState.value = config.filters as never;
    data.columnOrderState.value = config.order;
    data.columnVisibilityState.value = config.visibility;
    data.columnPinningState.value = config.pinning;
    data.sortingState.value = config.sorting as never;
    data.paginationState.value = config.pagination;
  };

  const exportConfig = async (): Promise<void> => {
    const config = buildConfig();
    if (!config) return;

    const code = encodeConfig(config);

    try {
      await navigator.clipboard.writeText(code);
      toast.add({
        color: "success",
        icon: "i-ph-clipboard-text",
        title: t("dms.table.export_config_copied"),
        duration: TOAST_DURATION_MS,
      });
    } catch {
      toast.add({
        color: "error",
        title: t("dms.table.export_config_failed"),
        description: code,
      });
    }
  };

  const importConfig = (code: string): boolean => {
    try {
      const config = decodeConfig(code);
      applyConfig(config);
      toast.add({
        color: "success",
        icon: "i-ph-check-circle",
        title: t("dms.table.import_config_success"),
        duration: TOAST_DURATION_MS,
      });
      return true;
    } catch {
      toast.add({
        color: "error",
        title: t("dms.table.import_config_invalid"),
        duration: TOAST_DURATION_MS,
      });
      return false;
    }
  };

  return { exportConfig, importConfig };
};
