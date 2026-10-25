<script setup lang="ts">
import { computed } from "vue";
import type { MatrixColumn } from "../../../types/matrix";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import type { MatrixSection } from "../../composables/matrix/matrixSections";
import { kindOf } from "../../composables/matrix/matrixValues";

/**
 * The header row of a group: its label, description, badge and row count, a
 * button folding its rows (`aria-expanded`) when groups fold, and with
 * `subtotals` the group's own column sums under the columns.
 */
interface MatrixGroupHeaderProps {
  section: MatrixSection;
  columns: MatrixColumn[];
  /** `left` of each pinned column, by id. */
  stickyLefts: Record<string, number>;
  hasTotalColumn: boolean;
}

const props = defineProps<MatrixGroupHeaderProps>();
const matrix = useMatrixContext();
const { t, locale } = useI18n();

const group = computed(() => props.section.group!);
const isFolded = computed(() => matrix.rows.isCollapsed(props.section.key));
const isFoldable = computed(() => matrix.rows.isFoldable.value);
const showsCount = computed(() => matrix.options.grouping?.count === true);
const hasSubtotals = computed(
  () =>
    matrix.options.grouping?.subtotals === true &&
    matrix.options.totals?.columns === true,
);
const subtotals = computed(() =>
  hasSubtotals.value ? matrix.sectionTotals(props.section) : null,
);
const format = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value);
const subtotalOf = (column: MatrixColumn) =>
  kindOf(column) === "number" && subtotals.value
    ? format(subtotals.value.columns[column.id] ?? 0)
    : "";
const colspan = computed(
  () => props.columns.length + 1 + (props.hasTotalColumn ? 1 : 0),
);
const CELL_CLASS =
  "h-9 border-b border-(--ui-border-default) bg-(--dms-bg-muted) py-0";
</script>

<template>
  <tr role="row" data-matrix-group>
    <th
      scope="rowgroup"
      :colspan="hasSubtotals ? 1 : colspan"
      class="text-start font-normal"
      :class="[CELL_CLASS, hasSubtotals && 'sticky start-0 z-10']"
    >
      <div
        class="sticky start-0 inline-flex max-w-full items-center gap-2 ps-3 pe-3"
      >
        <component
          :is="isFoldable ? 'button' : 'span'"
          :type="isFoldable ? 'button' : undefined"
          class="inline-flex min-w-0 items-center gap-2"
          :class="isFoldable && 'hover:text-highlighted rounded-sm'"
          :aria-expanded="isFoldable ? !isFolded : undefined"
          :aria-label="
            isFoldable
              ? t(
                  isFolded
                    ? 'dms.matrix.group_expand'
                    : 'dms.matrix.group_collapse',
                  {
                    group: matrix.text(group.label),
                  },
                )
              : undefined
          "
          @click="isFoldable && matrix.rows.toggleGroup(props.section.key)"
        >
          <UIcon
            v-if="isFoldable"
            name="i-ph-caret-down"
            class="text-dimmed size-3.5 shrink-0 transition-transform"
            :class="isFolded && '-rotate-90'"
          />
          <span
            class="text-highlighted truncate font-mono text-xs font-semibold uppercase"
          >
            {{ matrix.text(group.label) }}
          </span>
        </component>
        <span
          v-if="showsCount"
          class="bg-elevated text-dimmed rounded-[4px] px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums"
        >
          {{ format(props.section.rows.length) }}
        </span>
        <DmsStatusPill
          v-if="group.badge"
          :label="matrix.text(group.badge)"
          :tone="group.badgeTone ?? 'neutral'"
          dot="none"
          size="sm"
        />
        <span
          v-if="group.description"
          class="text-dimmed truncate text-[11.5px]"
        >
          {{ matrix.text(group.description) }}
        </span>
      </div>
    </th>
    <template v-if="hasSubtotals">
      <td
        v-for="column in props.columns"
        :key="column.id"
        class="text-muted px-3 text-end font-mono text-xs tabular-nums"
        :class="[CELL_CLASS, column.id in props.stickyLefts && 'sticky z-10']"
        :style="
          column.id in props.stickyLefts
            ? { left: `${props.stickyLefts[column.id]}px` }
            : undefined
        "
      >
        {{ subtotalOf(column) }}
      </td>
      <td
        v-if="props.hasTotalColumn"
        class="text-highlighted px-3 text-end font-mono text-xs font-semibold tabular-nums"
        :class="CELL_CLASS"
      >
        {{ format(subtotals?.total ?? 0) }}
      </td>
    </template>
  </tr>
</template>
