import type { TableViewListResponse } from "../../../composables/table-view/types";
import {
  type QuickFilterItem,
  quickFilterMode,
  relationQuickFilterItems,
  relationQuickFilterSource,
  type ResolvedQuickFilter,
  staticQuickFilterItems,
} from "./utils/quickFilters";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewQuickFilters<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "configuration" | "arrival" | "rows" | "tabs" | "props"
  >,
) {
  const { allColumns } = scope.configuration;
  const { processI18n } = scope.arrival;
  const { $authFetch } = scope.rows;
  const { t } = scope.tabs;
  const { props } = scope;
  const { getDataType } = useDataTypes();
  const relationQuickFilterValues = ref<Record<string, QuickFilterItem[]>>({});

  const relationQuickFiltersLoaded = ref(false);
  const quickFilterDefinitions = (props.quickFilters ?? []).map((filter) => {
    const column = allColumns.find(
      (candidate) => candidate.accessorKey === filter.field,
    );
    return {
      filter,
      column,
      mode: quickFilterMode(column, filter.mode),
      items: staticQuickFilterItems(column, processI18n),
      source: relationQuickFilterSource(column, getDataType),
    };
  });

  const RELATION_QUICK_FILTER_LIMIT = 200;

  const loadRelationQuickFilters = async () => {
    await Promise.allSettled(
      quickFilterDefinitions
        .filter((definition) => !definition.items && definition.source)
        .map(async ({ filter, source }) => {
          // prettier-ignore
          try {
          const response = await $authFetch<
            TableViewListResponse<Parameters<typeof relationQuickFilterItems>[0][number]>
          >(source!.searchUrl, {
            query: { limit: RELATION_QUICK_FILTER_LIMIT },
          });
          relationQuickFilterValues.value = {
            ...relationQuickFilterValues.value,
            [filter.field]: relationQuickFilterItems(response.results, source!),
          };
        } catch {
          // eslint-disable-line no-empty -- Failed loads retain prior choices.
        }
        }),
    );
    relationQuickFiltersLoaded.value = true;
  };

  const resolvedQuickFilters = computed<ResolvedQuickFilter[]>(() =>
    quickFilterDefinitions
      .map(({ filter, column, mode, items, source }) => ({
        field: filter.field,
        label: processI18n(filter.label ?? column?.header ?? filter.field),
        icon: filter.icon ?? "i-ph-funnel",
        allLabel: filter.allLabel
          ? processI18n(filter.allLabel)
          : t("dms.table.quick_filter.all"),
        mode,
        items: items ?? relationQuickFilterValues.value[filter.field] ?? [],
        pending: !items && !!source && !relationQuickFiltersLoaded.value,
      }))
      .filter((filter) => filter.items.length > 0 || filter.pending),
  );
  return { loadRelationQuickFilters, resolvedQuickFilters };
}
