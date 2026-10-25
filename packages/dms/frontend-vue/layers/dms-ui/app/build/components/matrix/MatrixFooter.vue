<script setup lang="ts">
import { computed } from "vue";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import {
  DEFAULT_MATRIX_PAGE_SIZES,
  pageCountOf,
  pagerItems,
} from "../../composables/matrix/matrixQuery";

/**
 * The grid's footer: how many rows, the route's own line, the keyboard
 * shortcuts of an editable grid, and the pager of a paginated one (page
 * numbers with gaps, rows per page).
 */
const matrix = useMatrixContext();
const { t, n } = useI18n();

const query = matrix.query;
const isPaged = computed(() => matrix.options.pagination === "pages");
const rowCount = computed(() => matrix.rows.rows.value.length);
const total = computed(() => matrix.source.data.value?.total ?? rowCount.value);
const page = computed(() => query.state.value.page);
const pageSize = computed(() => query.state.value.pageSize);
const pageCount = computed(() => pageCountOf(total.value, pageSize.value));
const start = computed(() =>
  total.value === 0 ? 0 : page.value * pageSize.value + 1,
);
const end = computed(() =>
  Math.min(total.value, (page.value + 1) * pageSize.value),
);
const items = computed(() => pagerItems(page.value, pageCount.value));
const sizeItems = computed(() =>
  [
    ...new Set([
      ...(matrix.options.pageSizes ?? DEFAULT_MATRIX_PAGE_SIZES),
      pageSize.value,
    ]),
  ]
    .sort((left, right) => left - right)
    .map((size) => ({ label: String(size), value: size })),
);
const footerLine = computed(() =>
  matrix.text(matrix.source.data.value?.footer),
);
const isEditable = computed(() => matrix.canEdit.value);
const isStaged = computed(() => matrix.options.saveMode === "staged");
</script>

<template>
  <footer
    class="border-default text-muted flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t py-2 ps-[18px] pe-3.5 text-xs"
  >
    <span class="tabular-nums">
      <template v-if="isPaged">
        {{
          t("dms.matrix.range", {
            start: n(start),
            end: n(end),
            total: n(total),
          })
        }}
      </template>
      <template v-else>
        {{ t("dms.matrix.rows", { count: n(total) }, total) }}
      </template>
    </span>
    <span v-if="footerLine" class="text-toned">{{ footerLine }}</span>
    <span
      v-if="isEditable"
      class="text-dimmed hidden flex-wrap items-center gap-x-2.5 gap-y-1 xl:flex"
    >
      <span class="inline-flex items-center gap-1">
        <UKbd value="enter" size="sm" />
        {{ t("dms.matrix.shortcuts.edit") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <UKbd value="esc" size="sm" />
        {{ t("dms.matrix.shortcuts.cancel") }}
      </span>
      <span class="inline-flex items-center gap-1">
        <UKbd value="tab" size="sm" />
        {{ t("dms.matrix.shortcuts.next") }}
      </span>
      <span
        v-if="matrix.hasRowPanel.value"
        class="inline-flex items-center gap-1"
      >
        <UKbd value="space" size="sm" />
        {{ t("dms.matrix.shortcuts.open_row") }}
      </span>
      <span
        v-if="matrix.options.jumpToEmpty"
        class="inline-flex items-center gap-1"
      >
        <UKbd value="N" size="sm" />
        {{ t("dms.matrix.shortcuts.next_empty") }}
      </span>
      <span v-if="isStaged" class="inline-flex items-center gap-1">
        <UKbd value="meta" size="sm" />
        <UKbd value="S" size="sm" />
        {{ t("dms.matrix.shortcuts.save") }}
      </span>
    </span>
    <nav
      v-if="isPaged"
      class="ms-auto flex flex-wrap items-center gap-1"
      :aria-label="t('dms.matrix.pagination')"
    >
      <span class="me-1 flex items-center gap-1.5">
        {{ t("dms.matrix.page_size") }}
        <USelect
          :model-value="pageSize"
          :items="sizeItems"
          size="xs"
          class="w-20"
          :aria-label="t('dms.matrix.page_size')"
          @update:model-value="query.setPageSize(Number($event))"
        />
      </span>
      <UButton
        icon="i-ph-caret-left"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="page === 0"
        :aria-label="t('dms.matrix.previous_page')"
        @click="query.setPage(page - 1)"
      />
      <template
        v-for="item in items"
        :key="item.type === 'gap' ? item.key : item.page"
      >
        <span
          v-if="item.type === 'gap'"
          class="text-dimmed px-1"
          aria-hidden="true"
        >
          …
        </span>
        <UButton
          v-else
          size="xs"
          class="tabular-nums"
          :color="item.page === page ? 'primary' : 'neutral'"
          :variant="item.page === page ? 'soft' : 'ghost'"
          :label="String(item.page + 1)"
          :aria-current="item.page === page ? 'page' : undefined"
          :aria-label="t('dms.matrix.page', { page: item.page + 1 })"
          @click="query.setPage(item.page)"
        />
      </template>
      <UButton
        icon="i-ph-caret-right"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="end >= total"
        :aria-label="t('dms.matrix.next_page')"
        @click="query.setPage(page + 1)"
      />
    </nav>
  </footer>
</template>
