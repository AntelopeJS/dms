import { injectLocal } from "@vueuse/core";
import type { ShallowRef } from "vue";
import type { TableSharedData, Data } from "../../components/table/Table.vue";

export const useTableContext = <T extends Data>() => {
  const context =
    injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");

  if (!context?.value) {
    throw new Error("useTableContext must be used within a Table component");
  }

  return context.value;
};
