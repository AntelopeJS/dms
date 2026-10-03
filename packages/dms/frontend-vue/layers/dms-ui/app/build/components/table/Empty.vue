<script setup lang="ts" generic="T extends Data">
import { injectLocal } from "@vueuse/core";
import type { ShallowRef } from "vue";
import DmsEmptyState, {
  type EmptyStateVariant,
} from "../../../components/empty-state/EmptyState.vue";

import type { TableSharedData, Data } from "./Table.vue";
import { clearTableFiltersLabelKey } from "../../composables/table/utils/clearTableFilters";

// The table's empty body: the generic v2 empty state (hatched, 44px well),
// worded and equipped for why the table is empty — load error, filters
// matching nothing, archive view, or no rows yet.

interface TableEmptyProps {
  canAddRow?: boolean;
  /**
   * Message (i18n key) of a failed data fetch; switches the panel to its
   * error state so a refused query never reads as "no data".
   */
  loadError?: string;
  /** The table lists archived rows (archive mode toggle on). */
  archived?: boolean;
}

const props = defineProps<TableEmptyProps>();

const { t, te } = useI18n();

const tableSharedDataRef =
  injectLocal<ShallowRef<TableSharedData<T>>>("tableSharedData");
const tableSharedData = computed(() => tableSharedDataRef?.value);

// A search, a filter chip or a quick filter narrows the rows.
const isFiltered = computed(() => !!tableSharedData.value?.isFiltered?.value);
// What the clear action would clear; nothing (only default filters left at
// their value) offers no action.
const clearable = computed(
  () => tableSharedData.value?.clearableFilters?.value,
);

interface EmptyStateContent {
  title: string;
  description: string;
  icon: string;
  variant: EmptyStateVariant;
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
      variant: "error",
    };
  }
  if (isFiltered.value) {
    return {
      title: t("dms.table.no_results_title"),
      description: t("dms.table.no_results_message"),
      icon: "i-ph-magnifying-glass",
      variant: "no-result",
    };
  }
  if (props.archived) {
    return {
      title: t("dms.table.archived_empty_title"),
      description: t("dms.table.archived_empty_message"),
      icon: "i-ph-archive",
      variant: "no-data",
    };
  }
  return {
    title: t("dms.table.empty_title"),
    description: t("dms.table.empty_message"),
    icon: "i-ph-tray",
    variant: "no-data",
  };
});

const actions = computed(() => {
  if (props.loadError) {
    return [
      {
        label: t("dms.table.load_error_retry"),
        icon: "i-ph-arrows-clockwise",
        color: "neutral" as const,
        variant: "outline" as const,
        size: "md" as const,
        onClick: () => tableSharedData.value?.emits("refresh"),
      },
    ];
  }
  if (isFiltered.value) {
    const parts = clearable.value;
    if (!parts?.filters && !parts?.search) return undefined;
    return [
      {
        label: t(clearTableFiltersLabelKey(parts)),
        icon: "i-ph-x",
        color: "neutral" as const,
        variant: "outline" as const,
        size: "md" as const,
        onClick: () => tableSharedData.value?.resetFilters(),
      },
    ];
  }
  if (props.archived) {
    return [
      {
        label: t("dms.table.show_active"),
        icon: "i-ph-arrow-left",
        color: "neutral" as const,
        variant: "outline" as const,
        size: "md" as const,
        onClick: () => {
          const state = tableSharedData.value?.showArchivedState;
          if (state) state.value = false;
        },
      },
    ];
  }
  if (props.canAddRow) {
    return [
      {
        label: t("dms.table.new_row"),
        icon: "i-ph-plus",
        color: "primary" as const,
        size: "md" as const,
        onClick: () => tableSharedData.value?.emits("add"),
      },
    ];
  }
  return undefined;
});
</script>

<template>
  <DmsEmptyState
    :variant="content.variant"
    :icon="content.icon"
    :title="content.title"
    :description="content.description"
    :actions="actions"
    size="lg"
    framed
    class="z-10 w-full"
  />
</template>
