import { ref, watch, type Ref } from "vue";
import type { MatrixOptions } from "../../../types/matrix";
import {
  DEFAULT_MATRIX_PAGE_SIZE,
  emptyMatrixQuery,
  nextMatrixSort,
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
      )
    : defaults;
  const state = ref<MatrixQueryState>(initial);

  if (keepsUrl)
    watch(
      state,
      (next) =>
        writeMatrixUrlEntries(
          matrixUrlEntries(componentId, next, defaults, facetIds),
        ),
      { deep: true },
    );

  const refine = (patch: Partial<MatrixQueryState>) => {
    state.value = { ...state.value, ...patch, page: 0 };
  };

  return {
    state,
    isFiltered: () =>
      Boolean(state.value.search.trim()) ||
      Boolean(state.value.status) ||
      Object.values(state.value.facets).some((values) => values.length > 0),
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
    clearFilters: () => refine({ search: "", status: "", facets: {} }),
  };
}
