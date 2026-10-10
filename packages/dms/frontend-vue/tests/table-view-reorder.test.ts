import { computed, ref, watch } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTableReorder } from "../layers/dms-ui/app/build/composables/table-view/useTableReorder";
import {
  moveRow,
  reorderEdits,
} from "../layers/dms-ui/app/build/composables/table-view/utils/reorder";
import type { TableViewListResponse } from "../layers/dms-ui/app/composables/table-view/types";

type Api = Parameters<typeof useTableReorder>[0]["api"];

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rows ordered by hand", () => {
  const ranked = (positions: number[]) =>
    positions.map((position, index) => ({ _id: `r${index}`, position }));

  it("moves a row", () => {
    expect(moveRow(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("saves the moved row alone when its neighbours leave room", () => {
    const moved = moveRow(ranked([1, 2, 3, 4]), 3, 1);
    expect(reorderEdits(moved, 1, "position", "_id")).toEqual([
      { id: "r3", value: 1.5 },
    ]);
    const last = moveRow(ranked([1, 2, 3]), 0, 2);
    expect(reorderEdits(last, 2, "position", "_id")).toEqual([
      { id: "r0", value: 4 },
    ]);
  });

  it("renumbers only the rows whose position changed when there is no room", () => {
    const moved = moveRow(ranked([5, 5, 6, 7]), 3, 1);
    expect(reorderEdits(moved, 1, "position", "_id")).toEqual([
      { id: "r3", value: 6 },
      { id: "r1", value: 7 },
      { id: "r2", value: 8 },
    ]);
  });

  const reorderOf = (
    api: ReturnType<typeof vi.fn>,
    narrowed = false,
    data = ref<TableViewListResponse<Record<string, unknown>> | null>({
      results: ranked([1, 2, 3]),
      total: 3,
      offset: 0,
      limit: 10,
    }),
  ) => {
    const refresh = vi.fn();
    const onError = vi.fn();
    const { reorderState } = useTableReorder({
      reorder: { field: "position" },
      data,
      rowIdKey: "_id",
      location: "/api/features",
      api: api as unknown as Api,
      canEdit: computed(() => true),
      isNarrowed: computed(() => narrowed),
      isOrderedDisplay: computed(() => true),
      refresh,
      onError,
    });
    return { reorderState, data, refresh, onError };
  };

  it("moves the row at once and saves its new position by a partial edit", async () => {
    const api = vi.fn(async () => ({}));
    const { reorderState, data } = reorderOf(api);
    expect(reorderState.value?.enabled).toBe(true);
    await reorderState.value!.move(2, 0);
    expect(data.value?.results.map((row) => row._id)).toEqual([
      "r2",
      "r0",
      "r1",
    ]);
    expect(data.value?.results[0]?.position).toBe(0);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/api/features/edit", {
      method: "PUT",
      query: { id: "r2" },
      body: { position: 0 },
    });
  });

  it("lists the rows again when the save fails, and is off while narrowed", async () => {
    const api = vi.fn(async () => {
      throw new Error("denied");
    });
    const { reorderState, refresh, onError } = reorderOf(api);
    await reorderState.value!.move(0, 1);
    expect(onError).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(reorderOf(api, true).reorderState.value?.enabled).toBe(false);
  });

  it("draws no handle for a caller who may not edit, whose tooltip would say to clear the filters", () => {
    const { reorderState } = useTableReorder({
      reorder: { field: "position" },
      data: ref(null),
      rowIdKey: "_id",
      location: "/api/features",
      api: vi.fn() as unknown as Api,
      canEdit: computed(() => false),
      isNarrowed: computed(() => false),
      isOrderedDisplay: computed(() => true),
      refresh: vi.fn(),
      onError: vi.fn(),
    });
    expect(reorderState.value).toBe(undefined);
  });
});
