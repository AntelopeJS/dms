import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { h, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type {
  TableViewColumn,
  TableViewGroupedConfig,
} from "../../../composables/table-view/types";
import type {
  Data,
  TableFilter,
  TableRowGrouping,
} from "../../components/table/Table.vue";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";
import {
  dateGroupLabel,
  groupFilter,
  NO_GROUP_KEY,
  rowGroupKey,
} from "./utils/groupedRows";

const GROUP_EYEBROW_CLASS = `${EYEBROW_CLASS} text-dimmed`;

export interface GroupedRowsOptions {
  /** Follows the group-by the user picks in the options menu. */
  grouped: MaybeRefOrGetter<TableViewGroupedConfig | undefined>;
  /** The grouped display is the one shown. */
  isActive: ComputedRef<boolean>;
  columns: TableViewColumn[];
  /** The rows listed. */
  rows: ComputedRef<Data[] | undefined>;
  /** The count query of the rows listed, narrowed by one more filter. */
  countQuery: (filter: TableFilter) => Record<string, unknown>;
  /** Asks the counts, by id, in one request (`count/batch`). */
  countBatch: (
    queries: { id: string; query: Record<string, unknown> }[],
  ) => Promise<Record<string, number>>;
}

/**
 * The `grouped` display: the grid's rows sorted on the grouped column, a
 * header row before each group — the value as its cell draws it, or the day
 * or week of a date — and, with `count`, how many rows each group holds.
 */
export function useGroupedRows(options: GroupedRowsOptions) {
  const { isActive, columns, rows } = options;
  const { t, locale } = useI18n();
  const { renderColumnValue } = useColumnValueRenderer();
  const grouped = computed(() => toValue(options.grouped));
  const by = computed(() => grouped.value?.by ?? "value");
  const field = computed(() => grouped.value?.groupByField ?? "");
  const column = computed(() =>
    columns.find((candidate) => candidate.accessorKey === field.value),
  );

  const keyOf = (row: Data): string =>
    rowGroupKey(get(row, field.value), by.value, locale.value);

  // A date heads its group as a mono eyebrow ("TODAY · 29 SEPT"); a value
  // as its cell draws it, without the row's other fields.
  const eyebrow = (text: string) =>
    h("span", { class: GROUP_EYEBROW_CLASS }, text);
  const header = (key: string, row: Data) => {
    if (key === NO_GROUP_KEY) return eyebrow(t("dms.table.grouped.none"));
    if (by.value !== "value") {
      return eyebrow(
        dateGroupLabel(key, by.value, locale.value, {
          today: t("dms.table.grouped.today"),
          yesterday: t("dms.table.grouped.yesterday"),
          weekOf: (date) => t("dms.table.grouped.week_of", { date }),
        }),
      );
    }
    return column.value
      ? renderColumnValue(column.value, {
          [field.value]: get(row, field.value),
        })
      : key;
  };

  const counts = ref<Record<string, number>>({});
  const listedKeys = computed(() =>
    isActive.value && grouped.value?.count
      ? [...new Set((rows.value ?? []).map(keyOf))]
      : [],
  );

  // Asked again whenever the groups listed or the rows' filters change.
  const countQueries = computed(() =>
    listedKeys.value.flatMap((key) => {
      const filter = groupFilter(field.value, key, by.value);
      return filter ? [{ id: key, query: options.countQuery(filter) }] : [];
    }),
  );

  // Counted in the browser: a server render draws the headers without them.
  const refreshCounts = async () => {
    const queries = countQueries.value;
    if (import.meta.env.SSR || queries.length === 0) return;
    try {
      counts.value = await options.countBatch(queries);
    } catch {
      // Without its count a group header still reads.
    }
  };

  if (grouped.value?.count) {
    watch(countQueries, () => void refreshCounts(), {
      immediate: true,
      deep: true,
    });
  }

  const grouping = computed<TableRowGrouping<Data> | undefined>(() => {
    const config = grouped.value;
    if (!isActive.value || !config) return undefined;
    return {
      keyOf,
      header,
      collapsible: config.collapsible,
      countOf: config.count ? (key) => counts.value[key] : undefined,
    };
  });

  return { grouping, refreshCounts };
}
