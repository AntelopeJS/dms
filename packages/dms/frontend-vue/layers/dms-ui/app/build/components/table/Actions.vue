<script setup lang="ts" generic="T extends Data">
import { injectLocal, useFocus, useFocusWithin } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { ShallowRef } from "vue";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";

import TableMenu from "./Menu.vue";
import type { Data, TableSharedData } from "./Table.vue";
import { KANBAN_DISPLAY_ID } from "../../../composables/table-view/types";
import type { CustomButton } from "../../../composables/table-view/types/custom-button";
import { useTableContext } from "../../composables/table/useTableContext";
import { createTableViewShiftFShortcut } from "../../../composables/table-view/shortcuts/tableViewShiftF";
import {
  FULL_TABLE_CHROME,
  type ResolvedTableChrome,
} from "../../composables/table-view/utils/chrome";
import {
  applyQuickFilter,
  quickFilterButtonLabel,
  quickFilterValue,
  type ResolvedQuickFilter,
} from "../../composables/table-view/utils/quickFilters";
import DmsSearchInput from "../form/SearchInput.vue";

const theme = tv({
  slots: {
    root: "flex flex-wrap items-center gap-1.5",
    base: "flex items-center gap-0.5",
    search: "flex items-center",
    searchContainer:
      "transition-width relative overflow-hidden duration-300 ease-in-out",
    // Always-open search field of a reduced chrome (v2 settings lists).
    searchField: "w-[240px] max-sm:w-full",
    // A quick filter: a secondary button naming the picked value, joined by
    // its clear button while it has no chip to clear it from.
    quickFilterGroup: "inline-flex",
    quickFilter: "max-sm:h-8",
    quickFilterClear: "rounded-s-none border-s border-default max-sm:h-8",
    // v2 toolbar icon triggers: muted until hovered, lit while their panel
    // is open or their configuration differs from the default.
    // Phones get 32px touch targets (28px from sm up).
    trigger:
      "text-muted hover:bg-elevated hover:text-highlighted max-sm:size-8",
    triggerIndicatorHost: "relative inline-flex",
    triggerIndicator:
      "pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-(--dms-accent-fill) ring-2 ring-(--ui-bg)",
    // Phones wrap the toolbar: a separator would dangle at a line end.
    separator: "mx-1 h-[18px] w-px bg-(--ui-border) max-sm:hidden",
    // v2 display switch: an icon-only segmented control (table, kanban,
    // cards…) on the band color, the active display raised onto the card.
    displaySwitch:
      "inline-flex h-7 items-center gap-0.5 rounded-md border border-default bg-(--dms-bg-muted) p-0.5 max-sm:h-8",
    displaySwitchItem:
      "inline-flex h-full items-center rounded-[6px] px-[7px] text-muted transition-colors hover:text-highlighted [&>svg]:size-[15px]",
    groupBy:
      "inline-flex h-7 items-center gap-1.5 rounded-full border border-accented px-[11px] font-mono text-xs text-muted hover:text-highlighted max-sm:h-8",
    groupByValue: "font-semibold text-default",
    // Archive mode toggle: a secondary button that turns amber while the
    // table lists archived rows.
    archiveToggle: "max-sm:h-8",

    add: "hidden sm:flex",
    addMobile: "size-8 sm:hidden",
  },
  variants: {
    searchActive: {
      true: {
        searchContainer: "w-40 sm:w-[220px]",
      },
      false: {
        searchContainer: "w-0",
      },
    },
    triggerOn: {
      true: {
        trigger: "bg-accented text-highlighted",
      },
    },
    displayActive: {
      true: {
        displaySwitchItem:
          "bg-(--ui-bg) text-highlighted shadow-sm ring-1 ring-(--ui-border-accented)",
      },
    },
    archiveOn: {
      true: {
        archiveToggle:
          "bg-(--dms-warning-tint) text-warning ring-(--dms-warning-line) hover:bg-(--dms-warning-tint) hover:text-warning",
      },
    },
    quickFilterOn: {
      true: {
        quickFilter: "text-highlighted",
      },
    },
    quickFilterClearable: {
      true: {
        quickFilter: "rounded-e-none",
      },
    },
  },
});

interface TableActionsProps {
  canAddRow?: boolean;
  /** Shows the archive mode toggle, bound to the `showArchived` model. */
  archiveToggle?: boolean;
  customButtons?: CustomButton[];
  onCustomButton?: (button: CustomButton) => void;
  /** Which controls are drawn; the full chrome by default. */
  chrome?: ResolvedTableChrome;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /** Dropdown filters writing their column's filter. */
  quickFilters?: ResolvedQuickFilter[];
}

const props = defineProps<TableActionsProps>();

const showArchived = defineModel<boolean>("showArchived", { default: false });

const chrome = computed(() => props.chrome ?? FULL_TABLE_CHROME);
const showSearch = computed(
  () => capabilities.value.search && chrome.value.search !== "none",
);
const isSearchField = computed(() => chrome.value.search === "field");
// The icon toolbar is left out altogether when the chrome draws none of it.
const hasIconControls = computed(
  () =>
    (showSearch.value && !isSearchField.value) ||
    (capabilities.value.filters && chrome.value.filters) ||
    showSortControl.value ||
    chrome.value.refresh ||
    chrome.value.menu,
);

const tableSharedData = useTableContext<T>();

// Chrome capabilities of the active display; gates the transverse controls.
const capabilities = computed(() => tableSharedData.activeCapabilities.value);

// The sort menu lists the columns the list route can sort on; with none, the
// button would open an empty menu.
const hasSortableColumns = computed(() =>
  tableSharedData.labeledColumns.value.some((col) => col.column.getCanSort()),
);
const showSortControl = computed(
  () =>
    capabilities.value.sorting &&
    chrome.value.sorting &&
    hasSortableColumns.value,
);

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

// A search set from outside (a view opened) shows in its field.
watch(
  () => tableSharedData!.globalFilterState.value,
  (newValue) => {
    if (newValue === undefined && searchActive.value) {
      searchActive.value = false;
    }
    if (newValue && !searchActive.value) searchActive.value = true;
  },
  { immediate: true },
);

// A "clear all" action emptied the search: fold it back to its icon, as
// leaving an empty field does.
tableSharedData.onFiltersCleared(() => {
  if (!searchAreaFocused.value) searchActive.value = false;
});

watch(searchAreaFocused, (isFocused) => {
  if (isFocused || !searchActive.value) return;
  if (tableSharedData?.globalFilterState.value) return;
  searchActive.value = false;
});

const toggleSearch = () => {
  searchActive.value = !searchActive.value;
  inputFocus.value = !inputFocus.value;
};

const searchFieldRef = ref<{ $el: HTMLElement }>();

const focusSearchBar = () => {
  const host = isSearchField.value
    ? searchFieldRef.value
    : searchInputRef.value;
  (host as unknown as { $el: HTMLElement } | undefined)?.$el
    ?.querySelector("input")
    ?.focus();
};

const searchPlaceholderText = computed(() =>
  props.searchPlaceholder
    ? processI18n(props.searchPlaceholder)
    : t("dms.table.search_placeholder"),
);

const pickedQuickFilter = (filter: ResolvedQuickFilter): string | undefined =>
  quickFilterValue(tableSharedData.columnFiltersState.value, filter);

// Without a filters row to show the chip (the compact layout), the button
// names the column and its value ("Role: Admin") and carries the clear.
const quickFilterLabel = (filter: ResolvedQuickFilter): string =>
  quickFilterButtonLabel(
    filter,
    tableSharedData.columnFiltersState.value,
    chrome.value.filters,
  );

const isQuickFilterClearable = (filter: ResolvedQuickFilter): boolean =>
  !chrome.value.filters && pickedQuickFilter(filter) !== undefined;

// A new value lists the first page.
const setQuickFilter = (
  filter: ResolvedQuickFilter,
  value: string | undefined,
) => {
  const { columnFiltersState, paginationState } = tableSharedData;
  columnFiltersState.value = applyQuickFilter(
    columnFiltersState.value,
    filter,
    value,
  );
  if (paginationState.value.pageIndex !== 0) {
    paginationState.value = { ...paginationState.value, pageIndex: 0 };
  }
};

const quickFilterItems = (filter: ResolvedQuickFilter) => {
  const picked = pickedQuickFilter(filter);
  return [
    [
      {
        label: filter.allLabel,
        type: "checkbox" as const,
        checked: picked === undefined,
        onSelect: () => setQuickFilter(filter, undefined),
      },
    ],
    filter.items.map((item) => ({
      label: item.label,
      type: "checkbox" as const,
      checked: item.value === picked,
      onSelect: () => setQuickFilter(filter, item.value),
    })),
  ];
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

const hasCustomSort = computed(() => !!tableSharedData?.hasCustomSort.value);

// The offered displays and the group-by options can change after setup (a
// display registered from a `.client` plugin joins after hydration), so they
// are read from the live shared ref rather than from the snapshot
// `useTableContext` returns.
const sharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const displays = computed(() => sharedDataRef?.value?.displays ?? []);
const activeDisplay = computed(
  () => sharedDataRef?.value?.activeDisplayState.value,
);
const setActiveDisplay = (id: string) => {
  if (sharedDataRef?.value) sharedDataRef.value.activeDisplayState.value = id;
};

const groupByOptions = computed(
  () => sharedDataRef?.value?.kanbanGroupByOptions ?? [],
);
const groupByField = computed(
  () => sharedDataRef?.value?.kanbanGroupByState.value,
);
const showGroupBy = computed(
  () =>
    activeDisplay.value === KANBAN_DISPLAY_ID &&
    groupByOptions.value.length > 1,
);
const groupByLabel = computed(
  () =>
    groupByOptions.value.find((option) => option.value === groupByField.value)
      ?.label ?? "",
);
const groupByItems = computed(() =>
  groupByOptions.value.map((option) => ({
    label: option.label,
    type: "checkbox" as const,
    checked: option.value === groupByField.value,
    onSelect: () => {
      if (sharedDataRef?.value) {
        sharedDataRef.value.kanbanGroupByState.value = option.value;
      }
    },
  })),
);

const hasTrailingButtons = computed(
  () =>
    props.canAddRow ||
    props.archiveToggle ||
    (props.customButtons?.length ?? 0) > 0,
);

const uiTableActionsVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableActions || {}),
});
const uiTableActions = computed(() => uiTableActionsVariant());
</script>

<template>
  <div :class="uiTableActions.root()">
    <DmsSearchInput
      v-if="showSearch && isSearchField"
      ref="searchFieldRef"
      v-model="tableSharedData!.globalFilterState.value"
      :placeholder="searchPlaceholderText"
      size="sm"
      :class="uiTableActions.searchField()"
      @keydown.esc="closeSearch"
    />

    <div
      v-for="filter in props.quickFilters ?? []"
      :key="filter.field"
      :class="uiTableActions.quickFilterGroup()"
    >
      <UDropdownMenu
        :items="quickFilterItems(filter)"
        :content="{ align: 'end' }"
        :ui="{ content: 'min-w-48' }"
      >
        <UButton
          size="sm"
          color="neutral"
          :variant="pickedQuickFilter(filter) ? 'soft' : 'outline'"
          :icon="filter.icon"
          :label="quickFilterLabel(filter)"
          :aria-label="filter.label"
          :disabled="filter.pending"
          :class="
            uiTableActions.quickFilter({
              quickFilterOn: !!pickedQuickFilter(filter),
              quickFilterClearable: isQuickFilterClearable(filter),
            })
          "
        />
      </UDropdownMenu>
      <UButton
        v-if="isQuickFilterClearable(filter)"
        size="sm"
        color="neutral"
        variant="soft"
        :icon="appConfig.ui.icons.close"
        :aria-label="t('dms.table.quick_filter.clear', { label: filter.label })"
        :class="uiTableActions.quickFilterClear()"
        @click="setQuickFilter(filter, undefined)"
      />
    </div>

    <div v-if="hasIconControls" :class="uiTableActions.base()">
      <div
        v-if="showSearch && !isSearchField"
        ref="searchSectionRef"
        :class="uiTableActions.search()"
      >
        <UButton
          v-if="!searchActive"
          icon="i-ph-magnifying-glass"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTableActions.trigger()"
          @click="toggleSearch"
        />

        <div :class="uiTableActions.searchContainer({ searchActive })">
          <UInput
            v-if="searchActive"
            ref="searchInputRef"
            v-model="tableSharedData!.globalFilterState.value"
            :placeholder="t('dms.table.search_placeholder')"
            icon="i-ph-magnifying-glass"
            size="sm"
            class="w-full"
            autofocus
            @keydown.esc="closeSearch"
          >
            <template #trailing>
              <UKbd value="Esc" size="sm" />
            </template>
          </UInput>
        </div>
      </div>

      <span
        v-if="capabilities.filters && chrome.filters"
        id="filter-trigger"
        :class="uiTableActions.triggerIndicatorHost()"
      >
        <UButton
          icon="i-ph-funnel"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="
            uiTableActions.trigger({
              triggerOn: filtersRowOpen || hasCustomFilterConfig,
            })
          "
          :aria-label="t('dms.table.filters_title')"
          @click="toggleFiltersRow"
        />
        <span
          v-if="hasCustomFilterConfig"
          :class="uiTableActions.triggerIndicator()"
        />
      </span>

      <UPopover v-if="showSortControl" v-model:open="sortOpen">
        <span
          id="sorting-trigger"
          :class="uiTableActions.triggerIndicatorHost()"
        >
          <UButton
            icon="i-ph-arrows-down-up"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :class="
              uiTableActions.trigger({ triggerOn: sortOpen || hasCustomSort })
            "
          />
          <span
            v-if="hasCustomSort"
            :class="uiTableActions.triggerIndicator()"
          />
        </span>

        <template #content>
          <TableMenu default-view="sort" />
        </template>
      </UPopover>

      <UButton
        v-if="chrome.refresh"
        id="refresh-trigger"
        icon="i-ph-arrows-clockwise"
        :aria-label="t('dms.button.refresh_data')"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        :class="uiTableActions.trigger()"
        @click="tableSharedData!.emits('refresh')"
      />

      <UPopover v-if="chrome.menu" v-model:open="menuOpen">
        <UButton
          id="table-menu"
          :icon="appConfig.ui.icons.ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTableActions.trigger({ triggerOn: menuOpen })"
        />

        <template #content>
          <TableMenu />
        </template>
      </UPopover>
    </div>

    <template v-if="displays.length > 1">
      <span aria-hidden="true" :class="uiTableActions.separator()" />
      <div
        role="radiogroup"
        :aria-label="t('dms.table.view_mode_title')"
        :class="uiTableActions.displaySwitch()"
      >
        <UTooltip
          v-for="display in displays"
          :key="display.id"
          :text="t(display.label)"
        >
          <button
            type="button"
            role="radio"
            :aria-checked="activeDisplay === display.id"
            :aria-label="t(display.label)"
            :class="
              uiTableActions.displaySwitchItem({
                displayActive: activeDisplay === display.id,
              })
            "
            @click="setActiveDisplay(display.id)"
          >
            <UIcon :name="display.icon" />
          </button>
        </UTooltip>
      </div>
    </template>

    <UDropdownMenu v-if="showGroupBy" :items="groupByItems">
      <button type="button" :class="uiTableActions.groupBy()">
        {{ t("dms.table.kanban.group_by") }}
        <span :class="uiTableActions.groupByValue()">{{ groupByLabel }}</span>
        <UIcon :name="appConfig.ui.icons.chevronDown" class="size-3.5" />
      </button>
    </UDropdownMenu>

    <span
      v-if="hasTrailingButtons"
      aria-hidden="true"
      :class="uiTableActions.separator()"
    />

    <UButton
      v-if="archiveToggle"
      id="archive-toggle"
      :label="
        showArchived ? t('dms.table.archived') : t('dms.table.archive_toggle')
      "
      icon="i-ph-archive"
      color="neutral"
      variant="outline"
      size="sm"
      :aria-pressed="showArchived"
      :class="uiTableActions.archiveToggle({ archiveOn: showArchived })"
      @click="showArchived = !showArchived"
    />

    <!-- A disabled button fires no pointer event: the tooltip hangs on a
      wrapper, focusable so the reason also reaches keyboard users. -->
    <UTooltip
      v-for="(button, index) in customButtons"
      :key="`custom-btn-${index}`"
      :text="button.disabledReason && processI18n(button.disabledReason)"
      :disabled="!button.disabled || !button.disabledReason"
    >
      <span :tabindex="button.disabled ? 0 : undefined" class="inline-flex">
        <UButton
          :label="processI18n(button.label)"
          :icon="button.icon"
          :variant="button.variant ?? 'outline'"
          :color="button.color ?? 'neutral'"
          :disabled="button.disabled"
          size="sm"
          @click="props.onCustomButton?.(button)"
        />
      </span>
    </UTooltip>

    <UButton
      v-if="canAddRow"
      :label="t('dms.table.new_row')"
      :icon="appConfig.ui.icons.plus"
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
  </div>
</template>
