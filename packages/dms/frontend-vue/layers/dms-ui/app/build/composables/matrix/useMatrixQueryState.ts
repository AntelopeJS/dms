import { ref, watch, type Ref } from "vue";
import type { MatrixOptions } from "../../../types/matrix";
import { acceptsColumnFilter } from "./matrixColumns";
import {
  DEFAULT_MATRIX_PAGE_SIZE,
  emptyMatrixQuery,
  nextMatrixSort,
  type MatrixColumnFilter,
  type MatrixQueryState,
} from "./matrixQuery";
import {
  matrixUrlEntries,
  readMatrixUrlState,
  writeMatrixUrlEntries,
} from "./matrixUrlState";

export interface MatrixQueryControls {
  state: Ref<MatrixQueryState>;
  /** Any filter in use: a search, a status, a facet value. */
  isFiltered: () => boolean;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (search: string) => void;
  setStatus: (status: string) => void;
  setFacet: (facetId: string, values: string[]) => void;
  toggleSort: (columnId: string) => void;
  /** A column's header filter; `null` removes it. */
  setColumnFilter: (
    columnId: string,
    filter: MatrixColumnFilter | null,
  ) => void;
  clearColumnFilters: () => void;
  /** Drops the column filters `accepts` refuses (a column gone, or not filterable). */
  pruneColumnFilters: (accepts: (columnId: string) => boolean) => void;
  clearFilters: () => void;
}

/**
 * The page, search, status, facets and sort the grid reads its rows with.
 * With `urlState` (the default) they start from the page URL and are kept in
 * it, under keys prefixed with the component id (see `matrixUrlState`); a
 * change of filter or sort goes back to the first page.
 */
export function useMatrixQueryState(
  options: MatrixOptions,
  componentId: string,
): MatrixQueryControls {
  const defaults = emptyMatrixQuery(
    options.pageSize ?? DEFAULT_MATRIX_PAGE_SIZE,
  );
  const facetIds = (options.facets ?? []).map((facet) => facet.id);
  const keepsUrl = options.urlState !== false;
  const initial = keepsUrl
    ? readMatrixUrlState(
        useDmsRoute().query as Record<string, string>,
        componentId,
        defaults,
        facetIds,
        (columnId) =>
          acceptsColumnFilter(
            columnId,
            options.columnFilters,
            options.columns?.find((column) => column.id === columnId),
          ),
      )
    : defaults;
  const state = ref<MatrixQueryState>(initial);

  if (keepsUrl) {
    let written = state.value.filters;
    watch(
      state,
      (next) => {
        writeMatrixUrlEntries(
          matrixUrlEntries(componentId, next, defaults, facetIds, written),
        );
        written = next.filters;
      },
      { deep: true },
    );
  }

  const refine = (patch: Partial<MatrixQueryState>) => {
    state.value = { ...state.value, ...patch, page: 0 };
  };

  return {
    state,
    isFiltered: () =>
      Boolean(state.value.search.trim()) ||
      Boolean(state.value.status) ||
      Object.values(state.value.facets).some((values) => values.length > 0) ||
      Object.keys(state.value.filters).length > 0,
    setPage: (page) => {
      state.value = { ...state.value, page: Math.max(0, page) };
    },
    setPageSize: (pageSize) => refine({ pageSize }),
    setSearch: (search) => {
      if (search.trim() === state.value.search.trim()) return;
      refine({ search });
    },
    setStatus: (status) => refine({ status }),
    setFacet: (facetId, values) =>
      refine({ facets: { ...state.value.facets, [facetId]: values } }),
    toggleSort: (columnId) =>
      refine({ sort: nextMatrixSort(state.value.sort, columnId) }),
    setColumnFilter: (columnId, filter) => {
      const filters = { ...state.value.filters };
      if (filter?.value) filters[columnId] = filter;
      else Reflect.deleteProperty(filters, columnId);
      refine({ filters });
    },
    clearColumnFilters: () => refine({ filters: {} }),
    pruneColumnFilters: (accepts) => {
      const ids = Object.keys(state.value.filters);
      const kept = ids.filter(accepts);
      if (kept.length === ids.length) return;
      refine({
        filters: Object.fromEntries(
          kept.map((id) => [id, state.value.filters[id]!]),
        ),
      });
    },
    clearFilters: () =>
      refine({ search: "", status: "", facets: {}, filters: {} }),
  };
}
