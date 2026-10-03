// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  shallowRef,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginationState } from "@tanstack/vue-table";
import type { TableFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";
import {
  clearTableFilters,
  clearTableFiltersLabelKey,
  clearableTableFilters,
  isTableNarrowed,
  resetColumnFilters,
  type TableNarrowingState,
} from "../layers/dms-ui/app/build/composables/table/utils/clearTableFilters";
import TableEmpty from "../layers/dms-ui/app/build/components/table/Empty.vue";

const pinnedStatus = (value: unknown): TableFilter => ({
  accessorKey: "status",
  mode: "is",
  value,
  pinned: true,
  initialValue: "open",
});
const dueDate: TableFilter = {
  accessorKey: "dueDate",
  mode: "before",
  value: "2026-01-01",
  pinned: false,
};

interface Harness extends TableNarrowingState {
  columnFilters: Ref<TableFilter[]>;
  globalFilter: Ref<string | undefined>;
  quickFilterValues: Ref<Record<string, string | undefined>>;
  pagination: Ref<PaginationState>;
}

const createState = (
  overrides: Partial<{
    columnFilters: TableFilter[];
    globalFilter: string;
    quickFilterValues: Record<string, string | undefined>;
    pageIndex: number;
  }> = {},
): Harness => ({
  columnFilters: ref(overrides.columnFilters ?? []),
  globalFilter: ref(overrides.globalFilter ?? ""),
  quickFilterValues: ref(overrides.quickFilterValues ?? {}),
  pagination: ref({ pageIndex: overrides.pageIndex ?? 0, pageSize: 25 }),
});

describe("clearTableFilters", () => {
  it("clears the chips, the search and the quick filters, back to page 1", () => {
    const state = createState({
      columnFilters: [pinnedStatus("done"), dueDate],
      globalFilter: "dfgdf",
      quickFilterValues: { priority: "high" },
      pageIndex: 3,
    });

    clearTableFilters(state);

    // The default filter goes back to its value, the added chip is dropped.
    expect(state.columnFilters.value).toEqual([pinnedStatus("open")]);
    expect(state.globalFilter.value).toBe("");
    expect(state.quickFilterValues.value).toEqual({});
    expect(state.pagination.value).toEqual({ pageIndex: 0, pageSize: 25 });
  });

  it("keeps the page size", () => {
    const state = createState({ globalFilter: "x", pageIndex: 2 });
    state.pagination.value = { pageIndex: 2, pageSize: 50 };
    clearTableFilters(state);
    expect(state.pagination.value).toEqual({ pageIndex: 0, pageSize: 50 });
  });

  it("drops the added chips and resets the default ones", () => {
    expect(resetColumnFilters([dueDate, pinnedStatus("done")])).toEqual([
      pinnedStatus("open"),
    ]);
  });

  it("names what a clear would change", () => {
    expect(clearableTableFilters(createState())).toEqual({
      filters: false,
      search: false,
    });
    // A default filter at its own value is nothing to clear.
    expect(
      clearableTableFilters(
        createState({ columnFilters: [pinnedStatus("open")] }),
      ),
    ).toEqual({ filters: false, search: false });
    expect(clearableTableFilters(createState({ globalFilter: "abc" }))).toEqual(
      { filters: false, search: true },
    );
    expect(
      clearableTableFilters(
        createState({ quickFilterValues: { priority: "high" } }),
      ),
    ).toEqual({ filters: true, search: false });
    expect(
      clearableTableFilters(
        createState({ columnFilters: [dueDate], globalFilter: "abc" }),
      ),
    ).toEqual({ filters: true, search: true });
  });

  it("picks the label of what it clears", () => {
    expect(clearTableFiltersLabelKey({ filters: true, search: false })).toBe(
      "dms.table.clear_filters",
    );
    expect(clearTableFiltersLabelKey({ filters: false, search: true })).toBe(
      "dms.table.clear_search",
    );
    expect(clearTableFiltersLabelKey({ filters: true, search: true })).toBe(
      "dms.table.clear_filters_and_search",
    );
  });

  it("tells when the rows are narrowed", () => {
    expect(isTableNarrowed(createState())).toBe(false);
    // An empty chip narrows nothing.
    expect(
      isTableNarrowed(
        createState({ columnFilters: [{ ...dueDate, value: undefined }] }),
      ),
    ).toBe(false);
    expect(isTableNarrowed(createState({ globalFilter: "a" }))).toBe(true);
    expect(isTableNarrowed(createState({ columnFilters: [dueDate] }))).toBe(
      true,
    );
    expect(
      isTableNarrowed(createState({ quickFilterValues: { priority: "low" } })),
    ).toBe(true);
  });

  it("ignores a search the active display does not apply", () => {
    const state = {
      ...createState({ globalFilter: "a" }),
      searchApplies: ref(false),
    };
    expect(isTableNarrowed(state)).toBe(false);
    expect(clearableTableFilters(state)).toEqual({
      filters: false,
      search: false,
    });
  });
});

describe("table empty state", () => {
  let app: App | undefined;

  const mountEmpty = (state: Harness) => {
    const sharedData = shallowRef({
      resetFilters: () => clearTableFilters(state),
      clearableFilters: computed(() => clearableTableFilters(state)),
      isFiltered: computed(() => isTableNarrowed(state)),
      showArchivedState: ref(false),
      emits: vi.fn(),
    });
    const Host = defineComponent({
      setup() {
        provide("tableSharedData", sharedData);
        return () => h(TableEmpty);
      },
    });
    app = createApp(Host);
    app.component(
      "UButton",
      defineComponent({
        props: { label: String, onClick: Function },
        setup: (props) => () =>
          h("button", { onClick: props.onClick }, props.label),
      }),
    );
    app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
    const container = document.createElement("div");
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      te: () => false,
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("clears the filters and the search from the no-results state", async () => {
    const state = createState({
      columnFilters: [dueDate],
      globalFilter: "dfgdf",
      pageIndex: 1,
    });
    const container = mountEmpty(state);

    expect(container.textContent).toContain("dms.table.no_results_title");
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("dms.table.clear_filters_and_search");

    button.click();
    await nextTick();

    expect(state.globalFilter.value).toBe("");
    expect(state.columnFilters.value).toEqual([]);
    expect(state.pagination.value.pageIndex).toBe(0);
    // Nothing narrows the rows any more: the plain empty state is back.
    expect(container.textContent).toContain("dms.table.empty_title");
    expect(container.querySelector("button")).toBeNull();
  });

  it("offers to clear a search alone", async () => {
    const state = createState({ globalFilter: "dfgdf" });
    const container = mountEmpty(state);

    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("dms.table.clear_search");
    button.click();
    await nextTick();
    expect(state.globalFilter.value).toBe("");
  });

  it("offers no clear action when only default filters narrow the rows", () => {
    const container = mountEmpty(
      createState({ columnFilters: [pinnedStatus("open")] }),
    );
    expect(container.textContent).toContain("dms.table.no_results_title");
    expect(container.querySelector("button")).toBeNull();
  });
});
