/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

const shared = shallowRef<Record<string, unknown>>({});

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vueuse/core")>()),
  injectLocal: () => shared,
}));

const presentError = vi.fn();

const { useTableConfigClipboard } = await import(
  "../layers/dms-ui/app/build/composables/table/useTableConfigClipboard"
);

const CONFIG = {
  v: 1,
  filters: [{ accessorKey: "status", mode: "is", value: "open" }],
  order: ["status", "title"],
  visibility: { title: false },
  pinning: { left: ["status"] },
  sorting: [{ id: "title", desc: true }],
  pagination: { pageIndex: 2, pageSize: 50 },
  density: "compact",
};

const encode = (config: object) =>
  window.btoa(unescape(encodeURIComponent(JSON.stringify(config))));

describe("importConfig", () => {
  beforeEach(() => {
    presentError.mockReset();
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useApiErrorPresenter", () => ({ presentError }));
    shared.value = {
      globalFilterState: ref(""),
      columnFiltersState: ref([]),
      columnOrderState: ref([]),
      columnVisibilityState: ref({}),
      columnPinningState: ref({}),
      sortingState: ref([]),
      paginationState: ref({ pageIndex: 0, pageSize: 10 }),
      densityState: ref("default"),
    };
  });

  it("applies a config an export wrote", () => {
    const { importConfig } = useTableConfigClipboard();
    expect(importConfig(encode(CONFIG))).toBe(true);
    const state = shared.value as Record<string, { value: unknown }>;
    expect(state.paginationState?.value).toEqual({
      pageIndex: 2,
      pageSize: 50,
    });
    expect(state.sortingState?.value).toEqual([{ id: "title", desc: true }]);
    expect(state.densityState?.value).toBe("compact");
  });

  it("refuses a config whose sorting holds a non-sort entry", () => {
    const { importConfig } = useTableConfigClipboard();
    expect(importConfig(encode({ ...CONFIG, sorting: ["title"] }))).toBe(false);
    expect(presentError).toHaveBeenCalledOnce();
  });

  it("refuses a config missing its pagination", () => {
    const { importConfig } = useTableConfigClipboard();
    const { pagination: _pagination, ...partial } = CONFIG;
    expect(importConfig(encode(partial))).toBe(false);
  });

  it("refuses a config of another version", () => {
    const { importConfig } = useTableConfigClipboard();
    expect(importConfig(encode({ ...CONFIG, v: 2 }))).toBe(false);
  });
});
