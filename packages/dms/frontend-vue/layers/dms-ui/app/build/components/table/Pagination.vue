<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";

import type { TableSharedData, Data } from "./Table.vue";
import { DEFAULT_PAGE_SIZE } from "../../composables/table/constants";
import { pageSizeOptions } from "../../composables/table/utils/pageSizeOptions";

// v2 footer band: count and page size on the left, pager on the right.
const theme = tv({
  slots: {
    root: "flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-default bg-(--dms-bg-muted) py-2.5 ps-[18px] pe-3.5 text-[12.5px] text-muted",
    info: "shrink-0",
    count: "font-mono font-semibold tabular-nums text-default",
    pageSize: "flex items-center gap-2",
    pageSizeSelect: "w-[68px] font-mono",
    separator: "h-3.5 w-px bg-(--ui-border-accented)",
    actions: "ms-auto flex items-center gap-0.5",
    pageInfo: "me-1.5 tabular-nums",
    pageNumber: "font-mono font-semibold text-default",
    // Phones get 32px touch targets (28px from sm up).
    navButton: "text-muted hover:text-highlighted max-sm:size-8",
    hint: "ms-auto inline-flex min-w-0 items-center gap-1.5 text-xs text-muted",
    hintIcon: "size-3.5 shrink-0 text-dimmed",
    // Phones wrap the hint onto a second line rather than cut it.
    hintText: "truncate max-sm:whitespace-normal",
    // First page on its way: the band keeps its height with placeholders.
    placeholderCount: "h-3 w-20 rounded-[4px]",
    placeholderPager: "ms-auto h-3 w-24 rounded-[4px]",
    placeholderRoot: "min-h-[49px]",
  },
});

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tablePagination: Partial<typeof theme> };
};

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

const { t, locale } = useI18n();
const numberFormat = computed(() => new Intl.NumberFormat(locale.value));

const rowCount = computed(() => tableSharedData.value?.rowCount ?? 0);
const firstPageLoading = computed(
  () => !!tableSharedData.value?.firstPageLoading,
);

const pageSize = computed({
  get: () =>
    tableSharedData.value?.paginationState.value.pageSize || DEFAULT_PAGE_SIZE,
  set: (value: number) => {
    const state = tableSharedData.value?.paginationState;
    if (!state) return;
    state.value = { ...state.value, pageSize: value, pageIndex: 0 };
  },
});

const pageSizeItems = computed(() =>
  pageSizeOptions(tableSharedData.value?.defaultPageSize, pageSize.value),
);

const pageCount = computed(() =>
  Math.max(Math.ceil(rowCount.value / pageSize.value), 1),
);

const { processI18n } = useTranslation();

// A reduced chrome drops the page size picker, and the pager while a single
// page holds every row.
const showPageSize = computed(
  () => tableSharedData.value?.chrome.value.pageSize ?? true,
);
const showPager = computed(() => showPageSize.value || pageCount.value > 1);

// "7 members": the configured count text, pluralized on the count.
const countLabelKey = computed(() => {
  const key = tableSharedData.value?.footer?.countLabel;
  return key?.startsWith("$") ? key.slice(1) : key;
});
const hint = computed(() => {
  const text = tableSharedData.value?.footer?.hint;
  return text ? processI18n(text) : undefined;
});

const currentPage = computed(
  () => (tableSharedData.value?.paginationState.value.pageIndex || 0) + 1,
);

const uiTablePaginationVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tablePagination || {}),
});
const uiTablePagination = computed(() => uiTablePaginationVariant());
</script>

<template>
  <div
    v-if="firstPageLoading"
    aria-hidden="true"
    :class="[uiTablePagination.root(), uiTablePagination.placeholderRoot()]"
  >
    <USkeleton :class="uiTablePagination.placeholderCount()" />
    <USkeleton :class="uiTablePagination.placeholderPager()" />
  </div>
  <nav
    v-else-if="rowCount"
    :class="uiTablePagination.root()"
    :aria-label="t('dms.pagination.label')"
  >
    <span v-if="countLabelKey" :class="uiTablePagination.info()">
      {{ t(countLabelKey, { count: rowCount }, rowCount) }}
    </span>
    <i18n-t
      v-else
      keypath="dms.pagination.count"
      scope="global"
      tag="span"
      :class="uiTablePagination.info()"
    >
      <template #count>
        <span :class="uiTablePagination.count()">
          {{ numberFormat.format(rowCount) }}
        </span>
      </template>
    </i18n-t>

    <span
      v-if="showPageSize"
      aria-hidden="true"
      :class="uiTablePagination.separator()"
    />

    <span v-if="hint" :class="uiTablePagination.hint()">
      <UIcon name="i-ph-info" :class="uiTablePagination.hintIcon()" />
      <span :class="uiTablePagination.hintText()" :title="hint">
        {{ hint }}
      </span>
    </span>

    <label v-if="showPageSize" :class="uiTablePagination.pageSize()">
      {{ t("dms.table.page_size_title") }}
      <USelect
        v-model="pageSize"
        :items="pageSizeItems"
        size="xs"
        :class="uiTablePagination.pageSizeSelect()"
      />
    </label>

    <div
      v-if="showPager"
      :class="uiTablePagination.actions({ class: hint ? 'ms-0' : undefined })"
    >
      <i18n-t
        keypath="dms.pagination.current_page"
        scope="global"
        tag="span"
        :class="uiTablePagination.pageInfo()"
      >
        <template #currentPage>
          <span :class="uiTablePagination.pageNumber()">{{ currentPage }}</span>
        </template>
        <template #totalPages>
          <span :class="uiTablePagination.pageNumber()">{{ pageCount }}</span>
        </template>
      </i18n-t>

      <template v-if="pageCount > 1">
        <UButton
          :disabled="!tableSharedData?.table.getCanPreviousPage()"
          :icon="appConfig.ui.icons.chevronDoubleLeft"
          :aria-label="t('dms.pagination.first_page')"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTablePagination.navButton()"
          @click="tableSharedData?.table.firstPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanPreviousPage()"
          :icon="appConfig.ui.icons.chevronLeft"
          :aria-label="t('dms.pagination.previous_page')"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTablePagination.navButton()"
          @click="tableSharedData?.table.previousPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanNextPage()"
          :icon="appConfig.ui.icons.chevronRight"
          :aria-label="t('dms.pagination.next_page')"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTablePagination.navButton()"
          @click="tableSharedData?.table.nextPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanNextPage()"
          :icon="appConfig.ui.icons.chevronDoubleRight"
          :aria-label="t('dms.pagination.last_page')"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :class="uiTablePagination.navButton()"
          @click="tableSharedData?.table.lastPage()"
        />
      </template>
    </div>
  </nav>
</template>
