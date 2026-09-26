<script setup lang="ts" generic="T extends Data">
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import { tv } from "tailwind-variants";
import { injectLocal } from "@vueuse/core";
import { useId, type ShallowRef } from "vue";

import type { TableSharedData, Data } from "./Table.vue";

const theme = tv({
  slots: {
    root: "relative flex min-h-96 w-full flex-col items-center justify-center overflow-hidden rounded-b-lg z-10",
  },
});

interface TableEmptyProps {
  canAddRow?: boolean;
  /**
   * Message (i18n key) of a failed data fetch; switches the panel to its
   * error state so a refused query never reads as "no data".
   */
  loadError?: string;
}

const props = defineProps<TableEmptyProps>();

const { t, te } = useI18n();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { tableEmpty: Partial<typeof theme> };
};

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

const stripesId = `table-empty-stripes-${useId()}`;

const isFiltered = computed(() => {
  const hasGlobalFilter = !!tableSharedData.value?.globalFilterState?.value;
  const hasColumnFilters =
    (tableSharedData.value?.columnFiltersState?.value?.length ?? 0) > 0;
  return hasGlobalFilter || hasColumnFilters;
});

interface EmptyStateContent {
  title: string;
  description: string;
  icon: string;
}

const content = computed<EmptyStateContent>(() => {
  if (props.loadError) {
    // Only a resolvable key is rendered: `t()` echoes an unknown key verbatim,
    // and an error body is not necessarily a key. Error entries carry a
    // `{ title, description }` pair, so the description is tried first.
    return {
      title: t("dms.table.load_error_title"),
      description: te(`${props.loadError}.description`)
        ? t(`${props.loadError}.description`)
        : te(props.loadError)
          ? t(props.loadError)
          : t("dms.table.load_error_message"),
      icon: "i-ph-warning-circle",
    };
  }
  if (isFiltered.value) {
    return {
      title: t("dms.table.no_results_title"),
      description: t("dms.table.no_results_message"),
      icon: "i-ph-folder-open",
    };
  }
  return {
    title: t("dms.table.empty_title"),
    description: t("dms.table.empty_message"),
    icon: "i-ph-folder-open",
  };
});

const actions = computed(() => {
  if (props.loadError) {
    return [
      {
        label: t("dms.table.load_error_retry"),
        color: "neutral" as const,
        onClick: () => tableSharedData.value?.emits("refresh"),
      },
    ];
  }
  if (props.canAddRow) {
    return [
      {
        label: t("dms.table.new_row"),
        color: "neutral" as const,
        onClick: () => tableSharedData.value?.emits("add"),
      },
    ];
  }
  return undefined;
});

const uiTableEmptyVariant = tv({
  extend: tv(theme),
  ...(appConfig.ui?.tableEmpty || {}),
});
const uiTableEmpty = computed(() => uiTableEmptyVariant());
</script>

<template>
  <div :class="uiTableEmpty.root()">
    <svg
      class="stroke-inverted/10 absolute inset-0 -z-10 size-full"
      fill="none"
    >
      <defs>
        <pattern
          :id="stripesId"
          x="0"
          y="0"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path d="M-3 13 15-5M-5 5l18-18M-1 21 17 3" />
        </pattern>
      </defs>
      <rect
        stroke="none"
        :fill="`url(#${stripesId})`"
        width="100%"
        height="100%"
      />
    </svg>

    <UEmpty
      :title="content.title"
      :description="content.description"
      :actions="actions"
      :icon="content.icon"
      variant="naked"
    />
  </div>
</template>
