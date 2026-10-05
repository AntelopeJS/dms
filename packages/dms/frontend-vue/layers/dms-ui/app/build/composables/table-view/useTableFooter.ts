import type { ComputedRef } from "vue";
import type {
  TableViewColumn,
  TableViewFooter,
  TableViewFooterSummaryConfig,
} from "../../../composables/table-view/types";
import { useServerRenderedAsyncData } from "../../../composables/table-view/useServerRenderedAsyncData";
import type {
  TableFooterLegendItem,
  TableFooterTexts,
} from "../../components/table/Table.vue";
import { useColumnValueRenderer } from "../data-types/useColumnValueRenderer";

export interface TableFooterOptions {
  footer: TableViewFooter | undefined;
  columns: TableViewColumn[];
  location: string;
  /** The list query without paging: the rows the figures cover. */
  query: ComputedRef<Record<string, unknown>>;
  /** Prefix of the data key, unique to the table on its page. */
  dataKey: string;
}

interface LegendItemOption {
  label?: string;
  textColor?: string;
  iconColor?: string;
}

// Sorting changes no figure: it stays out of the summary request.
const UNSORTED_KEYS = new Set(["sortKey", "sortDirection"]);

/**
 * The footer band of a table view: its texts, the figures the `summary`
 * route computes over every listed row — a sum read like its column's cells
 * unless a `format` is given — and the legend of a select column.
 */
export async function useTableFooter(options: TableFooterOptions) {
  const { footer, columns, location } = options;
  const summaries = footer?.summary ?? [];
  const { $authFetch } = useAuthFetch();
  const { locale } = useI18n();
  const { processI18n } = useTranslation();
  const { renderValue } = useColumnValueRenderer();

  const summaryQuery = computed(() => ({
    ...Object.fromEntries(
      Object.entries(options.query.value).filter(
        ([key]) => !UNSORTED_KEYS.has(key),
      ),
    ),
    ids: summaries.map((summary) => summary.id),
  }));

  const { data: values, refresh } = await useServerRenderedAsyncData<
    Record<string, number>
  >(
    `${options.dataKey}-summary`,
    () =>
      summaries.length === 0
        ? Promise.resolve({})
        : $authFetch<Record<string, number>>(`${location}/summary`, {
            query: summaryQuery.value,
          }),
    { watch: [summaryQuery] },
  );

  const formatSummary = (
    summary: TableViewFooterSummaryConfig,
    value: number | undefined,
  ) => {
    if (value === undefined) return undefined;
    if (summary.format) {
      return new Intl.NumberFormat(locale.value, summary.format).format(value);
    }
    const column =
      summary.op === "sum"
        ? columns.find((candidate) => candidate.accessorKey === summary.field)
        : undefined;
    return column
      ? renderValue(column, value, undefined)
      : new Intl.NumberFormat(locale.value).format(value);
  };

  const legendColumn = columns.find(
    (column) => column.accessorKey === footer?.legend,
  );
  const legend = computed<TableFooterLegendItem[] | undefined>(() => {
    const items = (
      legendColumn?.type?.inputComponent?.options as
        | { items?: LegendItemOption[] }
        | undefined
    )?.items;
    return items?.map((item) => ({
      label: processI18n(item.label ?? ""),
      color: item.textColor ?? item.iconColor,
    }));
  });

  const resolved = computed<TableFooterTexts | undefined>(() =>
    footer
      ? {
          countLabel: footer.countLabel,
          hint: footer.hint,
          summaries: summaries.map((summary) => ({
            id: summary.id,
            label: processI18n(summary.label),
            value: formatSummary(summary, values.value?.[summary.id]),
          })),
          legend: legend.value,
        }
      : undefined,
  );

  return {
    footer: resolved,
    refreshSummaries: () => (summaries.length > 0 ? refresh() : undefined),
  };
}
