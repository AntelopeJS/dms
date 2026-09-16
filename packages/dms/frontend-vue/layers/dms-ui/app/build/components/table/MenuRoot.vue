<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";
import type { Data, TableSharedData, NavItem } from "./Table.vue";
import { useTableConfigClipboard } from "../../composables/table/useTableConfigClipboard";

const theme = tv({
  slots: {
    list: "p-1.5",
    item: "text-default hover:bg-accented/30 relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm outline-none group",

    leadingIcon:
      "size-4 text-dimmed group-hover:text-default transition-colors",
    itemLabel: "truncate",

    trailing: "ms-auto inline-flex items-center gap-1.5",
    trailingIcon: "size-4",

    kbds: "hidden shrink-0 items-center gap-1 lg:inline-flex",
  },
});

interface Emits {
  (e: "navigate", view: string): void;
}

const emits = defineEmits<Emits>();
const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuRoot: Partial<typeof theme> };
};

const tableSharedData =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");

const { exportConfig } = useTableConfigClipboard<T>();

const navItems = computed((): NavItem[] => {
  const capabilities = tableSharedData?.value?.activeCapabilities.value;
  const base: NavItem[] = [
    // Column visibility/pin/size/order are grid-only; hidden for displays that
    // don't manage columns (cards, kanban, ...).
    ...(capabilities?.columnManagement
      ? [
          {
            label: t("dms.table.columns_title"),
            icon: "i-ph-columns",
            hasSubMenu: true,
            showIndicator: !!tableSharedData?.value?.hasCustomColumns.value,
            onSelect: () => emits("navigate", "columns"),
          },
        ]
      : []),
    {
      label: t("dms.table.page_size_title"),
      icon: "i-ph-list",
      hasSubMenu: true,
      onSelect: () => emits("navigate", "page"),
    },
    ...(tableSharedData?.value?.hasDisplaySwitcher
      ? [
          {
            label: t("dms.table.view_mode_title"),
            icon: "i-ph-kanban",
            hasSubMenu: true,
            onSelect: () => emits("navigate", "viewMode"),
          },
        ]
      : []),
    {
      label: t("dms.table.export_config"),
      icon: "i-ph-clipboard-text",
      hasSubMenu: false,
      onSelect: () => exportConfig(),
    },
    {
      label: t("dms.table.import_config"),
      icon: "i-ph-clipboard",
      hasSubMenu: true,
      onSelect: () => emits("navigate", "import"),
    },
  ];

  if (
    tableSharedData?.value?.customNavItems &&
    tableSharedData.value.customNavItems.length > 0
  ) {
    base.push(...tableSharedData.value.customNavItems);
  }

  return base;
});

const uiTableMenuRootVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuRoot || {}),
});
const uiTableMenuRoot = computed(() => uiTableMenuRootVariant());
</script>

<template>
  <ul :class="uiTableMenuRoot.list()">
    <li
      v-for="(item, index) in navItems"
      :key="index"
      :class="uiTableMenuRoot.item()"
      @click="item.onSelect?.($event)"
    >
      <UChip :show="!!item.showIndicator" size="2xs">
        <Icon
          v-if="item.icon"
          :name="item.icon"
          :class="uiTableMenuRoot.leadingIcon()"
        />
      </UChip>
      <div :class="uiTableMenuRoot.itemLabel()">
        {{ item.label }}
      </div>

      <span :class="uiTableMenuRoot.trailing()">
        <Icon
          v-if="item.hasSubMenu"
          :name="appConfig.ui.icons.chevronRight"
          :class="uiTableMenuRoot.trailingIcon()"
        />
        <span v-else-if="item.kbds?.length" :class="uiTableMenuRoot.kbds()">
          <UKbd
            v-for="(kbd, kbdIndex) in item.kbds"
            :key="kbdIndex"
            size="sm"
            v-bind="typeof kbd === 'string' ? { value: kbd } : kbd"
          />
        </span>
      </span>
    </li>
  </ul>
</template>
