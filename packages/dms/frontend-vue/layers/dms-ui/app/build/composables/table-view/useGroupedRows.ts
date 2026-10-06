import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { h, type ComputedRef } from "vue";
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
  grouped: TableViewGroupedConfig | undefined;
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
  const { grouped, isActive, columns, rows } = options;
  const { t, locale } = useI18n();
  const { renderColumnValue } = useColumnValueRenderer();
  const by = grouped?.by ?? "value";
  const field = grouped?.groupByField ?? "";
  const column = columns.find((candidate) => candidate.accessorKey === field);

  const keyOf = (row: Data): string =>
    rowGroupKey(get(row, field), by, locale.value);

  // A date heads its group as a mono eyebrow ("TODAY · 29 SEPT"); a value
  // as its cell draws it, without the row's other fields.
  const eyebrow = (text: string) =>
    h("span", { class: GROUP_EYEBROW_CLASS }, text);
  const header = (key: string, row: Data) => {
    if (key === NO_GROUP_KEY) return eyebrow(t("dms.table.grouped.none"));
    if (by !== "value") {
      return eyebrow(
        dateGroupLabel(key, by, locale.value, {
          today: t("dms.table.grouped.today"),
          yesterday: t("dms.table.grouped.yesterday"),
          weekOf: (date) => t("dms.table.grouped.week_of", { date }),
        }),
      );
    }
    return column
      ? renderColumnValue(column, { [field]: get(row, field) })
      : key;
  };

  const counts = ref<Record<string, number>>({});
  const listedKeys = computed(() =>
    isActive.value && grouped?.count
      ? [...new Set((rows.value ?? []).map(keyOf))]
      : [],
  );

  // Asked again whenever the groups listed or the rows' filters change.
  const countQueries = computed(() =>
    listedKeys.value.flatMap((key) => {
      const filter = groupFilter(field, key, by);
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

  if (grouped?.count) {
    watch(countQueries, () => void refreshCounts(), {
      immediate: true,
      deep: true,
    });
  }

  const grouping = computed<TableRowGrouping<Data> | undefined>(() =>
    isActive.value && grouped
      ? {
          keyOf,
          header,
          collapsible: grouped.collapsible,
          countOf: grouped.count ? (key) => counts.value[key] : undefined,
        }
      : undefined,
  );

  return { grouping, refreshCounts };
}
