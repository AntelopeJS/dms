<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import type { MatrixFacet } from "../../../types/matrix";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import MatrixColumnsMenu from "./MatrixColumnsMenu.vue";
import MatrixStatusSegments, {
  type MatrixStatusSegment,
} from "./MatrixStatusSegments.vue";

/**
 * The grid's head: its title and description, the fills, the columns menu,
 * the CSV export and a refresh; then its filters: a search (Ctrl+/ focuses
 * it, typing waits for a pause), the status segments with their tones and
 * counts, and a select per facet; then the column filters in use as chips.
 */
const matrix = useMatrixContext();
const { t } = useI18n();
const SEARCH_DELAY_MS = 300;
const SEARCH_SHORTCUT = "/";
const ALL_STATUS = "";
const ALL_COUNT_KEY = "all";

const query = matrix.query;
const counts = computed(() => matrix.source.data.value?.counts ?? {});
const title = computed(() => matrix.text(matrix.options.title));
const description = computed(() => matrix.text(matrix.options.description));
const fillActions = computed(() => matrix.options.fillActions ?? []);
const facets = computed(() => matrix.options.facets ?? []);
const statusFilters = computed(() => matrix.options.statusFilters ?? []);
const canFill = computed(
  () => matrix.canEdit.value && fillActions.value.length > 0,
);
const hasTools = computed(
  () =>
    canFill.value ||
    matrix.options.columnsMenu ||
    matrix.options.exportCsv ||
    Boolean(matrix.options.fetchUrl),
);
const hasFilters = computed(
  () =>
    matrix.options.search ||
    statusFilters.value.length > 0 ||
    facets.value.length > 0,
);

const searchDraft = ref(query.state.value.search);
const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>(
  "searchInput",
);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchDraft, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => query.setSearch(value), SEARCH_DELAY_MS);
});
watch(
  () => query.state.value.search,
  (value) => {
    if (value !== searchDraft.value.trim()) searchDraft.value = value;
  },
);
onBeforeUnmount(() => clearTimeout(searchTimer));

useEventListener(
  typeof window === "undefined" ? undefined : window,
  "keydown",
  (event: KeyboardEvent) => {
    if (event.key !== SEARCH_SHORTCUT || !(event.ctrlKey || event.metaKey))
      return;
    if (!matrix.options.search) return;
    const active = document.activeElement?.closest("[data-dms-matrix]");
    const mine = matrix.root.value?.closest("[data-dms-matrix]");
    if (active && active !== mine) return;
    if (!active && document.querySelector("[data-dms-matrix]") !== mine) return;
    event.preventDefault();
    searchInput.value?.inputRef?.focus();
  },
);

const ownsAll = computed(() =>
  statusFilters.value.some((filter) => filter.id === ALL_COUNT_KEY),
);
const statusValue = computed(
  () =>
    query.state.value.status || (ownsAll.value ? ALL_COUNT_KEY : ALL_STATUS),
);
const statusItems = computed<MatrixStatusSegment[]>(() => [
  ...(ownsAll.value
    ? []
    : [
        {
          label: t("dms.matrix.status_all"),
          value: ALL_STATUS,
          count: counts.value[ALL_COUNT_KEY],
        },
      ]),
  ...statusFilters.value.map((filter) => ({
    label: matrix.text(filter.label),
    value: filter.id,
    tone: filter.tone,
    count: counts.value[filter.id],
  })),
]);

/** A column filter in use, as its chip reads it. */
interface FilterChip {
  columnId: string;
  label: string;
}

const filterChips = computed<FilterChip[]>(() =>
  Object.entries(query.state.value.filters).map(([columnId, filter]) => {
    const column = matrix.columns.columnById.value.get(columnId);
    return {
      columnId,
      label: t(`dms.matrix.filter.chip_${filter.mode}`, {
        column: column ? matrix.text(column.label) : columnId,
        value: filter.value,
      }),
    };
  }),
);

function facetItems(facet: MatrixFacet) {
  const items =
    facet.items ?? matrix.source.data.value?.facets?.[facet.id] ?? [];
  return items.map((item) => ({
    label:
      item.count === undefined
        ? matrix.text(item.label)
        : `${matrix.text(item.label)} · ${item.count}`,
    value: item.value,
  }));
}

function facetValue(facet: MatrixFacet) {
  const values = query.state.value.facets[facet.id] ?? [];
  return facet.multiple ? values : values[0];
}

function setFacet(facet: MatrixFacet, value: unknown): void {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  query.setFacet(facet.id, values.map(String));
}
</script>

<template>
  <div v-if="title || description || hasTools || hasFilters">
    <DmsSectionHeader
      v-if="title || description || hasTools"
      size="card"
      class="border-default border-b py-3 ps-[18px] pe-3.5"
      :title="title || undefined"
      :description="description || undefined"
    >
      <template #trailing>
        <UButton
          v-for="action in canFill ? fillActions : []"
          :key="action.id"
          :label="matrix.text(action.label)"
          :icon="action.icon"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="matrix.tools.runningFill.value === action.id"
          :disabled="Boolean(matrix.tools.runningFill.value)"
          @click="matrix.tools.runFill(action)"
        />
        <MatrixColumnsMenu v-if="matrix.options.columnsMenu" />
        <UButton
          v-if="matrix.options.exportCsv"
          icon="i-ph-download-simple"
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('dms.matrix.export_csv')"
          @click="matrix.tools.exportCsv()"
        />
        <UTooltip
          v-if="matrix.options.fetchUrl"
          :text="t('dms.matrix.refresh')"
        >
          <UButton
            icon="i-ph-arrows-clockwise"
            size="sm"
            color="neutral"
            variant="ghost"
            :loading="matrix.source.isLoading.value"
            :aria-label="t('dms.matrix.refresh')"
            @click="matrix.source.refresh()"
          />
        </UTooltip>
      </template>
    </DmsSectionHeader>
    <div
      v-if="hasFilters"
      class="border-default flex flex-wrap items-center gap-2 border-b py-2 ps-[18px] pe-3.5"
    >
      <UInput
        v-if="matrix.options.search"
        ref="searchInput"
        v-model="searchDraft"
        icon="i-ph-magnifying-glass"
        size="sm"
        class="w-64 max-w-full"
        :placeholder="t('dms.matrix.search')"
        :aria-label="t('dms.matrix.search')"
      >
        <template #trailing>
          <UKbd value="meta" size="sm" />
          <UKbd value="/" size="sm" />
        </template>
      </UInput>
      <MatrixStatusSegments
        v-if="statusFilters.length"
        :model-value="statusValue"
        :items="statusItems"
        :aria-label="t('dms.matrix.status')"
        @update:model-value="query.setStatus($event)"
      />
      <USelectMenu
        v-for="facet in facets"
        :key="facet.id"
        :model-value="facetValue(facet)"
        :items="facetItems(facet)"
        value-key="value"
        :multiple="facet.multiple"
        :icon="facet.icon"
        :placeholder="matrix.text(facet.label)"
        :aria-label="matrix.text(facet.label)"
        size="sm"
        class="min-w-40"
        @update:model-value="setFacet(facet, $event)"
      />
      <UButton
        v-if="query.isFiltered()"
        size="sm"
        color="neutral"
        variant="link"
        :label="t('dms.matrix.clear_filters')"
        @click="query.clearFilters()"
      />
    </div>
    <div
      v-if="filterChips.length"
      class="border-default flex flex-wrap items-center gap-1.5 border-b py-1.5 ps-[18px] pe-3.5"
      :aria-label="t('dms.matrix.filter.active')"
      role="group"
    >
      <UBadge
        v-for="chip in filterChips"
        :key="chip.columnId"
        color="neutral"
        variant="soft"
        size="md"
        class="gap-1"
      >
        {{ chip.label }}
        <button
          type="button"
          class="hover:text-highlighted -me-0.5 rounded-sm"
          :aria-label="
            t('dms.matrix.filter.remove_chip', { filter: chip.label })
          "
          @click="query.setColumnFilter(chip.columnId, null)"
        >
          <UIcon name="i-ph-x" class="size-3" />
        </button>
      </UBadge>
      <UButton
        size="xs"
        color="neutral"
        variant="link"
        :label="t('dms.matrix.filter.clear_all')"
        @click="query.clearColumnFilters()"
      />
    </div>
  </div>
</template>
