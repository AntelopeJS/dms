<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import type { ShallowRef } from "vue";
import type { TableSharedData, Data } from "./Table.vue";
import {
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "../../composables/table/constants";

const theme = tv({
  slots: {
    root: "px-3 py-2",
  },
});

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Module theme configuration is unchecked; retain its existing contract derived from this component's normalized theme.
const appConfig = useDmsAppConfig() as ReturnType<typeof useDmsAppConfig> & {
  ui: { tableMenuPage: Partial<typeof theme> };
};

const pageSize = computed({
  get() {
    return tableSharedData.value?.paginationState.value.pageSize || 0;
  },
  set(value: string) {
    const parsedValue = Number.parseInt(value, 10);

    if (!tableSharedData.value) {
      return;
    }

    tableSharedData.value.paginationState.value = {
      ...tableSharedData.value.paginationState.value,
      pageSize: parsedValue,
    };
  },
});

const uiTableMenuPageVariant = tv({
  extend: tv(theme),
  ...appConfig.ui?.tableMenuPage,
});
const uiTableMenuPage = computed(() => uiTableMenuPageVariant());
</script>

<template>
  <div v-if="tableSharedData" :class="uiTableMenuPage.root()">
    <UInputNumber
      v-model="pageSize"
      class="w-full"
      :max="MAX_PAGE_SIZE"
      :min="MIN_PAGE_SIZE"
    />
  </div>
</template>
