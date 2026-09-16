<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";
import type { TableSharedData, Data } from "./Table.vue";
import { KANBAN_DISPLAY_ID } from "../../../composables/table-view/types";

const theme = tv({
  slots: {
    root: "divide-default divide-y",
    list: "max-h-72 overflow-y-auto p-1.5",
    item: "text-default hover:bg-accented/30 relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1 pl-2 pr-1 text-sm",
    leadingIcon:
      "size-4 text-dimmed group-hover:text-default transition-colors",
    itemLabel: "grow truncate",
    checkIcon: "text-primary size-4",
    sectionTitle: "text-muted px-3 pt-2 text-xs font-medium",
  },
});

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

const { t } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableMenuViewMode: Partial<typeof theme> };
};

const activeDisplay = computed(
  () => tableSharedData.value?.activeDisplayState.value ?? "table",
);

const setActiveDisplay = (id: string) => {
  if (!tableSharedData.value) return;
  tableSharedData.value.activeDisplayState.value = id;
};

// Displays offered by this table view (already filtered by availability in
// TableView). Labels are i18n keys or literals; `t()` returns the key verbatim
// when no translation exists, so literals pass through unchanged.
const displayItems = computed(() => tableSharedData.value?.displays ?? []);

const groupByOptions = computed(
  () => tableSharedData.value?.kanbanGroupByOptions ?? [],
);
const groupByField = computed(
  () => tableSharedData.value?.kanbanGroupByState.value,
);

const selectGroupBy = (value: string) => {
  if (!tableSharedData.value) return;
  tableSharedData.value.kanbanGroupByState.value = value;
};

const showGroupBy = computed(
  () =>
    activeDisplay.value === KANBAN_DISPLAY_ID &&
    groupByOptions.value.length > 0,
);

const uiTableMenuViewModeVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableMenuViewMode || {}),
});
const uiTableMenuViewMode = computed(() => uiTableMenuViewModeVariant());
</script>

<template>
  <div :class="uiTableMenuViewMode.root()">
    <ul :class="uiTableMenuViewMode.list()">
      <li
        v-for="display in displayItems"
        :key="display.id"
        :class="uiTableMenuViewMode.item()"
        @click="setActiveDisplay(display.id)"
      >
        <Icon :name="display.icon" :class="uiTableMenuViewMode.leadingIcon()" />
        <span :class="uiTableMenuViewMode.itemLabel()">
          {{ t(display.label) }}
        </span>
        <Icon
          v-if="activeDisplay === display.id"
          :name="appConfig.ui.icons.check"
          :class="uiTableMenuViewMode.checkIcon()"
        />
      </li>
    </ul>

    <div v-if="showGroupBy">
      <p :class="uiTableMenuViewMode.sectionTitle()">
        {{ t("dms.table.kanban.group_by") }}
      </p>
      <ul :class="uiTableMenuViewMode.list()">
        <li
          v-for="option in groupByOptions"
          :key="option.value"
          :class="uiTableMenuViewMode.item()"
          @click="selectGroupBy(option.value)"
        >
          <span :class="uiTableMenuViewMode.itemLabel()">
            {{ option.label }}
          </span>
          <Icon
            v-if="groupByField === option.value"
            :name="appConfig.ui.icons.check"
            :class="uiTableMenuViewMode.checkIcon()"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
