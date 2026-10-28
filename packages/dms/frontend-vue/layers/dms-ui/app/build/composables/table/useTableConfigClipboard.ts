import { injectLocal } from "@vueuse/core";
import { isObject } from "#dms-core/app/utils/type-check";
import type { ShallowRef } from "vue";
import type {
  Data,
  TableDensity,
  TableSharedData,
} from "../../components/table/Table.vue";

const CONFIG_VERSION = 1;
const TOAST_DURATION_MS = 3000;

interface SerializedTableConfig {
  v: typeof CONFIG_VERSION;
  search?: string;
  filters: TableSharedData<Data>["columnFiltersState"]["value"];
  order: string[];
  visibility: Record<string, boolean>;
  pinning: { left?: string[]; right?: string[] };
  sorting: TableSharedData<Data>["sortingState"]["value"];
  pagination: { pageIndex: number; pageSize: number };
  density?: TableDensity;
}

const isSerializedConfig = (value: unknown): value is SerializedTableConfig => {
  if (!value || !isObject(value)) return false;
  return value.v === CONFIG_VERSION;
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
      density: data.densityState.value,
    };
  };

  const applyConfig = (config: SerializedTableConfig) => {
    const data = tableSharedData?.value;
    if (!data) return;

    data.globalFilterState.value = config.search ?? "";
    data.columnFiltersState.value = config.filters;
    data.columnOrderState.value = config.order;
    data.columnVisibilityState.value = config.visibility;
    data.columnPinningState.value = config.pinning;
    data.sortingState.value = config.sorting;
    data.paginationState.value = config.pagination;
    if (config.density) data.densityState.value = config.density;
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
