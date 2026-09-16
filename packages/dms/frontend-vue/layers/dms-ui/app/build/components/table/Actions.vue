<script setup lang="ts" generic="T extends Data">
import { useFocus, useFocusWithin } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

import TableMenu from "./Menu.vue";
import type { Data } from "./Table.vue";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import { useTableContext } from "../../composables/table/useTableContext";
import { createTableViewShiftFShortcut } from "../../../composables/table-view/shortcuts/tableViewShiftF";

const theme = tv({
  slots: {
    root: "flex items-center gap-1",
    base: "flex items-center gap-0.5",
    search: "flex items-center",
    searchContainer:
      "transition-width relative overflow-hidden duration-300 ease-in-out",

    add: "hidden sm:flex",
    addMobile: "sm:hidden",
  },
  variants: {
    searchActive: {
      true: {
        searchContainer: "w-40 sm:w-64",
      },
      false: {
        searchContainer: "w-0",
      },
    },
  },
});

interface TableActionsProps {
  canAddRow?: boolean;
  customButtons?: CustomButton[];
  onCustomButton?: (button: CustomButton) => void;
}

const props = defineProps<TableActionsProps>();

const tableSharedData = useTableContext<T>();

// Chrome capabilities of the active display; gates the transverse controls.
const capabilities = computed(() => tableSharedData.activeCapabilities.value);

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableActions: Partial<typeof theme> };
};

const { t } = useI18n();
const { processI18n } = useTranslation();

const searchActive = ref(false);
const searchInputRef = ref<HTMLInputElement>();
const searchSectionRef = ref<HTMLElement>();

const { focused: inputFocus } = useFocus(searchInputRef);
const { focused: searchAreaFocused } = useFocusWithin(searchSectionRef);

watch(
  () => tableSharedData!.globalFilterState.value,
  (newValue) => {
    if (newValue === undefined && searchActive.value) {
      searchActive.value = false;
    }
  },
);

watch(searchAreaFocused, (isFocused) => {
  if (isFocused || !searchActive.value) return;
  if (tableSharedData?.globalFilterState.value) return;
  searchActive.value = false;
});

const toggleSearch = () => {
  searchActive.value = !searchActive.value;
  inputFocus.value = !inputFocus.value;
};

const focusSearchBar = () => {
  (searchInputRef.value as unknown as { $el: HTMLElement } | undefined)?.$el
    ?.querySelector("input")
    ?.focus();
};

const closeSearch = () => {
  tableSharedData!.globalFilterState.value = "";
  searchActive.value = false;
};

defineShortcuts({
  shift_f: createTableViewShiftFShortcut(
    searchActive,
    tableSharedData!.globalFilterState,
    focusSearchBar,
  ),
});

const hasCustomFilterConfig = computed(() => {
  const filters = tableSharedData?.columnFiltersState.value || [];
  return filters.some((filter) => {
    if (!filter.pinned) return true;
    return !areEqualValues(filter.value, filter.initialValue);
  });
});

const areEqualValues = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

const toggleFiltersRow = () => {
  if (!tableSharedData) return;
  tableSharedData.filtersRowOpenState.value =
    !tableSharedData.filtersRowOpenState.value;
};

const sortOpen = ref(false);
const menuOpen = ref(false);

const filtersRowOpen = computed(
  () => !!tableSharedData?.filtersRowOpenState.value,
);

const triggerVariant = (isOpen: boolean) => (isOpen ? "soft" : "ghost");

const uiTableActionsVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableActions || {}),
});
const uiTableActions = computed(() => uiTableActionsVariant());
</script>

<template>
  <div :class="uiTableActions.root()">
    <div :class="uiTableActions.base()">
      <div
        v-if="capabilities.search"
        ref="searchSectionRef"
        :class="uiTableActions.search()"
      >
        <UButton
          icon="i-ph-magnifying-glass"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          @click="toggleSearch"
        />

        <div :class="uiTableActions.searchContainer({ searchActive })">
          <UInput
            v-if="searchActive"
            ref="searchInputRef"
            v-model="tableSharedData!.globalFilterState.value"
            :placeholder="t('dms.table.search_placeholder')"
            size="sm"
            class="w-full"
            variant="ghost"
            autofocus
            @keydown.esc="closeSearch"
          />
        </div>
      </div>

      <UChip
        v-if="capabilities.filters"
        id="filter-trigger"
        :show="hasCustomFilterConfig"
      >
        <UButton
          icon="i-ph-funnel"
          color="neutral"
          :variant="triggerVariant(filtersRowOpen)"
          size="sm"
          square
          :aria-label="t('dms.table.filters_title')"
          @click="toggleFiltersRow"
        />
      </UChip>

      <UPopover v-if="capabilities.sorting" v-model:open="sortOpen">
        <UChip
          id="sorting-trigger"
          :show="!!tableSharedData?.hasCustomSort.value"
        >
          <UButton
            icon="i-ph-arrows-down-up"
            color="neutral"
            :variant="triggerVariant(sortOpen)"
            size="sm"
            square
          />
        </UChip>

        <template #content>
          <TableMenu default-view="sort" />
        </template>
      </UPopover>

      <UButton
        id="refresh-trigger"
        icon="i-ph-arrow-clockwise"
        :aria-label="t('dms.button.refresh_data')"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        @click="tableSharedData!.emits('refresh')"
      />

      <UPopover v-model:open="menuOpen">
        <UButton
          id="table-menu"
          :icon="appConfig.ui.icons.ellipsis"
          color="neutral"
          :variant="triggerVariant(menuOpen)"
          size="sm"
          square
        />

        <template #content>
          <TableMenu />
        </template>
      </UPopover>
    </div>

    <UButton
      v-if="canAddRow"
      :label="t('dms.table.new_row')"
      :class="uiTableActions.add()"
      size="sm"
      @click="tableSharedData!.emits('add')"
    />
    <UButton
      v-if="canAddRow"
      :aria-label="t('dms.table.new_row')"
      :icon="appConfig.ui.icons.plus"
      :class="uiTableActions.addMobile()"
      size="sm"
      @click="tableSharedData!.emits('add')"
    />

    <UButton
      v-for="(button, index) in customButtons"
      :key="`custom-btn-${index}`"
      :label="processI18n(button.label)"
      :icon="button.icon"
      :variant="button.variant"
      :color="button.color"
      size="sm"
      @click="props.onCustomButton?.(button)"
    />
  </div>
</template>
