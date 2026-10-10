import { computed, nextTick, readonly, ref, watch, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationQuery } from "vue-router";
import { useAccumulatedPages } from "../layers/dms-ui/app/build/composables/table-view/useAccumulatedPages";
import { usePersistedPagination } from "../layers/dms-ui/app/build/composables/table-view/usePersistedPagination";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";

const PAGE_SIZE = 10;
const THIRD_PAGE = 2;

// What a table view derives from `queryParamFilters: { status: { field: "status" } }`.
const hiddenFiltersOf = (query: () => LocationQuery) =>
  computed(() =>
    query().status === undefined
      ? []
      : [{ accessorKey: "status", mode: "is", value: query().status }],
  );

const TABLE_KEY = "tables.tasks.query-filters";
const preferenceKey = (suffix: string) => `${TABLE_KEY}.${suffix}`;

// The `user-preferences` cookie, surviving the remounts of a page.
let cookie: Ref<Record<string, unknown>>;

// What a table view does on mount: its page, read back from the cookie,
// under the hidden filters the URL sets.
const mountTable = (query: Ref<LocationQuery>) => {
  const hiddenFilters = hiddenFiltersOf(() => query.value);
  const pagination = usePersistedPagination({
    preferences: usePreferences(),
    preferenceKey,
    defaults: { pageIndex: 0, pageSize: PAGE_SIZE },
    scope: () => [hiddenFilters.value, []],
  });
  return { hiddenFilters, pagination };
};

beforeEach(() => {
  cookie = ref({});
  vi.stubGlobal("useDmsCookie", () => cookie);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a hidden filter changed by the URL", () => {
  it("sends the pager back to page 1", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const { pagination } = mountTable(query);
    pagination.value = { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE };

    query.value = { status: "cancelled" };

    expect(pagination.value).toEqual({ pageIndex: 0, pageSize: PAGE_SIZE });
  });

  it("keeps the page when another query parameter changes", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const { pagination } = mountTable(query);
    pagination.value = { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE };

    query.value = { status: "pending", record: "42" };

    expect(pagination.value.pageIndex).toBe(THIRD_PAGE);
  });

  it("sends the pager back to page 1 when the filter goes away", () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const { pagination } = mountTable(query);
    pagination.value = { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE };

    query.value = {};

    expect(pagination.value.pageIndex).toBe(0);
  });

  it("starts at page 1 when a link remounts the page under another value", async () => {
    const first = mountTable(ref<LocationQuery>({ status: "pending" }));
    first.pagination.value = { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE };
    await nextTick();

    const other = mountTable(ref<LocationQuery>({ status: "completed" }));
    expect(other.pagination.value).toEqual({
      pageIndex: 0,
      pageSize: PAGE_SIZE,
    });
  });

  it("restores the page of a remount under the same value", async () => {
    const first = mountTable(ref<LocationQuery>({ status: "pending" }));
    first.pagination.value = { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE };
    await nextTick();

    const again = mountTable(ref<LocationQuery>({ status: "pending" }));
    expect(again.pagination.value.pageIndex).toBe(THIRD_PAGE);
  });

  it("keeps a page stored before its hidden filters were", () => {
    cookie.value = {
      tables: {
        tasks: {
          "query-filters": {
            pagination: { pageIndex: THIRD_PAGE, pageSize: PAGE_SIZE },
          },
        },
      },
    };
    const table = mountTable(ref<LocationQuery>({}));
    expect(table.pagination.value.pageIndex).toBe(THIRD_PAGE);
  });

  it("starts a load-more list over from one page", async () => {
    const query = ref<LocationQuery>({ status: "pending" });
    const hiddenFilters = hiddenFiltersOf(() => query.value);
    const pagination = ref({ pageIndex: 0, pageSize: PAGE_SIZE });
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
