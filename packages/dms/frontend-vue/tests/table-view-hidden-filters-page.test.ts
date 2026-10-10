import { computed, nextTick, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginationState } from "@tanstack/vue-table";
import type { LocationQuery } from "vue-router";
import { useAccumulatedPages } from "../layers/dms-ui/app/build/composables/table-view/useAccumulatedPages";
import { useFirstPageOnChange } from "../layers/dms-ui/app/build/composables/table-view/useFirstPageOnChange";

const PAGE_SIZE = 10;
const THIRD_PAGE = 2;

// What a table view derives from `queryParamFilters: { status: { field: "status" } }`.
const hiddenFiltersOf = (query: () => LocationQuery) =>
  computed(() =>
    query().status === undefined
      ? []
      : [{ accessorKey: "status", mode: "is", value: query().status }],
  );

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a hidden filter changed by the URL", () => {
  it("sends the pager back to page 1", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const hiddenFilters = hiddenFiltersOf(() => query.value);
    const pagination = ref<PaginationState>({
      pageIndex: THIRD_PAGE,
      pageSize: PAGE_SIZE,
    });
    useFirstPageOnChange(() => hiddenFilters.value, pagination);

    query.value = { status: "cancelled" };

    expect(pagination.value).toEqual({ pageIndex: 0, pageSize: PAGE_SIZE });
  });

  it("keeps the page when another query parameter changes", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const hiddenFilters = hiddenFiltersOf(() => query.value);
    const pagination = ref<PaginationState>({
      pageIndex: THIRD_PAGE,
      pageSize: PAGE_SIZE,
    });
    useFirstPageOnChange(() => hiddenFilters.value, pagination);

    query.value = { status: "pending", record: "42" };

    expect(pagination.value.pageIndex).toBe(THIRD_PAGE);
  });

  it("sends the pager back to page 1 when the filter goes away", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const hiddenFilters = hiddenFiltersOf(() => query.value);
    const pagination = ref<PaginationState>({
      pageIndex: THIRD_PAGE,
      pageSize: PAGE_SIZE,
    });
    useFirstPageOnChange(() => hiddenFilters.value, pagination);

    query.value = {};

    expect(pagination.value.pageIndex).toBe(0);
  });

  it("starts a load-more list over from one page", async () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const hiddenFilters = hiddenFiltersOf(() => query.value);
    const pagination = ref<PaginationState>({
      pageIndex: 0,
      pageSize: PAGE_SIZE,
    });
    const pages = useAccumulatedPages({
      mode: "loadMore",
      pagination,
      resetOn: [hiddenFilters],
    });
    pages.loadNextPage();
    expect(pages.requestedPagination.value.pageSize).toBe(PAGE_SIZE * 2);

    query.value = { status: "cancelled" };
    await nextTick();

    expect(pages.requestedPagination.value).toEqual({
      pageIndex: 0,
      pageSize: PAGE_SIZE,
    });
  });
});
