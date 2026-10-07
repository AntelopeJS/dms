<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";
import type { Data, TableDensity, TableSharedData } from "./Table.vue";

const theme = tv({
  slots: {
    list: "p-1.5",
    item: "text-default hover:bg-accented/30 relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm",
    leadingIcon: "size-4 text-dimmed",
    itemLabel: "grow truncate",
    checkIcon: "text-primary size-4",
  },
});

interface DensityItem {
  value: TableDensity;
  label: string;
  icon: string;
}

const DENSITY_ITEMS: DensityItem[] = [
  {
    value: "default",
    label: "dms.table.density_default",
    icon: "i-ph-rows",
  },
  {
    value: "compact",
    label: "dms.table.density_compact",
    icon: "i-ph-list-dashes",
  },
];

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuDensity: Partial<typeof theme> };
};

const activeDensity = computed(
  () => tableSharedData.value?.densityState.value ?? "default",
);

const selectDensity = (value: TableDensity) => {
  if (!tableSharedData.value) return;
  tableSharedData.value.densityState.value = value;
};

const uiTableMenuDensityVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuDensity || {}),
});
const uiTableMenuDensity = computed(() => uiTableMenuDensityVariant());
</script>

<template>
  <ul :class="uiTableMenuDensity.list()">
    <li
      v-for="item in DENSITY_ITEMS"
      :key="item.value"
      :class="uiTableMenuDensity.item()"
      @click="selectDensity(item.value)"
    >
      <Icon :name="item.icon" :class="uiTableMenuDensity.leadingIcon()" />
      <span :class="uiTableMenuDensity.itemLabel()">{{ t(item.label) }}</span>
      <Icon
        v-if="activeDensity === item.value"
        :name="appConfig.ui.icons.check"
        :class="uiTableMenuDensity.checkIcon()"
      />
    </li>
  </ul>
</template>
