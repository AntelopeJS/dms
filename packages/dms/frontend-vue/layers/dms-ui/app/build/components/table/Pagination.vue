<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import type { ShallowRef } from "vue";

import type { TableSharedData, Data } from "./Table.vue";
import { DEFAULT_PAGE_SIZE } from "../../composables/table/constants";

const theme = tv({
  slots: {
    root: "text-muted py-5 text-xs font-light",
    base: "grid gap-4 sm:flex sm:items-center",
    infoContainer: "flex w-full items-center justify-between",
    info: "shrink-0",
    actions: "flex items-center",
  },
});

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tablePagination: Partial<typeof theme> };
};

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

const pageCount = computed(() => {
  const rowCount = tableSharedData.value?.rowCount ?? 0;
  const pageSize =
    tableSharedData.value?.paginationState.value.pageSize || DEFAULT_PAGE_SIZE;
  return Math.ceil(rowCount / pageSize);
});

const { t } = useI18n();

const uiTablePaginationVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tablePagination || {}),
});
const uiTablePagination = computed(() => uiTablePaginationVariant());
</script>

<template>
  <nav
    v-if="uiTablePagination"
    :class="uiTablePagination.root()"
    :aria-label="t('dms.pagination.label')"
  >
    <div :class="uiTablePagination.base()">
      <div
        v-if="tableSharedData?.rowCount"
        :class="uiTablePagination.infoContainer()"
      >
        <div :class="uiTablePagination.info()">
          {{
            `${t("dms.pagination.count", { count: tableSharedData?.rowCount ?? 0 })} | ${t("dms.pagination.size", { pageSize: tableSharedData?.paginationState.value.pageSize || 0 })}`
          }}
        </div>
        <div :class="uiTablePagination.info()">
          {{
            t("dms.pagination.current_page", {
              currentPage:
                (tableSharedData?.paginationState.value.pageIndex || 0) + 1,
              totalPages: pageCount,
            })
          }}
        </div>
      </div>

      <div v-if="pageCount > 1" :class="uiTablePagination.actions()">
        <UButton
          :disabled="!tableSharedData?.table.getCanPreviousPage()"
          :icon="appConfig.ui.icons.chevronDoubleLeft"
          :aria-label="t('dms.pagination.first_page')"
          color="neutral"
          variant="ghost"
          class="w-full sm:w-auto"
          @click="tableSharedData?.table.firstPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanPreviousPage()"
          :icon="appConfig.ui.icons.chevronLeft"
          :aria-label="t('dms.pagination.previous_page')"
          color="neutral"
          variant="ghost"
          class="w-full sm:w-auto"
          @click="tableSharedData?.table.previousPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanNextPage()"
          :icon="appConfig.ui.icons.chevronRight"
          :aria-label="t('dms.pagination.next_page')"
          color="neutral"
          variant="ghost"
          class="w-full justify-end sm:w-auto"
          @click="tableSharedData?.table.nextPage()"
        />
        <UButton
          :disabled="!tableSharedData?.table.getCanNextPage()"
          :icon="appConfig.ui.icons.chevronDoubleRight"
          :aria-label="t('dms.pagination.last_page')"
          color="neutral"
          variant="ghost"
          class="w-full justify-end sm:w-auto"
          @click="tableSharedData?.table.lastPage()"
        />
      </div>
    </div>
  </nav>
</template>
