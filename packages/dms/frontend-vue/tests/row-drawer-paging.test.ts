/** @vitest-environment jsdom */
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RowLocation } from "../layers/dms-ui/app/entries/composables/actions/rowNavigation";
import {
  type Row,
  type OpenedDrawer,
  opened,
  drawerAction,
  mountTargets,
  latest,
  headerOf,
  press,
} from "./row-drawer-runtime";

describe("a row drawer's steps across the table's pages", () => {
  const PAGE_SIZE = 2;
  const allRows: Row[] = Array.from({ length: 5 }, (_, index) => ({
    _id: `p${index}`,
    name: `Row ${index}`,
  }));

  function pagedTable() {
    const pageIndex = ref(0);
    const shown = ref<Row[]>(allRows.slice(0, PAGE_SIZE));
    const loadAdjacent = vi.fn(async (step: 1 | -1) => {
      const next = pageIndex.value + step;
      if (next < 0 || next * PAGE_SIZE >= allRows.length) return false;
      await new Promise((resolve) => setTimeout(resolve));
      pageIndex.value = next;
      shown.value = allRows.slice(next * PAGE_SIZE, (next + 1) * PAGE_SIZE);
      return true;
    });
    const targets = mountTargets(shown, {
      total: () => allRows.length,
      offset: () => pageIndex.value * PAGE_SIZE,
      loadAdjacent,
    });
    return { targets, loadAdjacent };
  }

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)!.navigation!;

  it("counts every row the table lists, not the page loaded", async () => {
    const { targets } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 1,
      total: 5,
      hasNext: true,
    });
  });

  it("loads the next page past the last row loaded, and steps back", async () => {
    const { targets, loadAdjacent } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("p2"));
    expect(loadAdjacent).toHaveBeenCalledWith(1);
    expect(navigationOf(drawer)).toMatchObject({ index: 2, total: 5 });
    press("k");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("p1"));
    expect(loadAdjacent).toHaveBeenLastCalledWith(-1);
    expect(navigationOf(drawer)).toMatchObject({ index: 1 });
  });

  it("stops at the table's last row", async () => {
    const { targets, loadAdjacent } = pagedTable();
    await loadAdjacent(1);
    await loadAdjacent(1);
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[4],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 4,
      total: 5,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("grows a feed in place: the next row follows the open one", async () => {
    const shown = ref<Row[]>(allRows.slice(0, PAGE_SIZE));
    const targets = mountTargets(shown, {
      total: () => allRows.length,
      loadAdjacent: async (step) => {
        if (step < 0) return false;
        shown.value = allRows.slice(0, shown.value.length + PAGE_SIZE);
        return true;
      },
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    navigationOf(opened[0]!).next();
    await vi.waitFor(() => expect(latest(opened[0]!).componentKey).toBe("p2"));
    expect(navigationOf(opened[0]!)).toMatchObject({ index: 2, total: 5 });
  });

  it("keeps to the rows loaded without a loader", async () => {
    const targets = mountTargets(ref(allRows.slice(0, PAGE_SIZE)), {
      total: () => allRows.length,
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(navigationOf(opened[0]!)).toMatchObject({
      index: 1,
      total: 5,
      hasNext: false,
    });
  });

  it("lands on no closed drawer", async () => {
    const { targets, loadAdjacent } = pagedTable();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    press("j");
    drawer.close();
    await vi.waitFor(() => expect(loadAdjacent).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(latest(drawer).componentKey).not.toBe("p2");
  });
});

describe("a row drawer off the rows loaded", () => {
  const allRows: Row[] = Array.from({ length: 6 }, (_, index) => ({
    _id: `q${index}`,
    name: `Row ${index}`,
  }));

  const locateIn = (all: () => Row[]) =>
    vi.fn(async (id: string): Promise<RowLocation | undefined> => {
      const rowsNow = all();
      const index = rowsNow.findIndex((row) => row._id === id);
      if (index < 0) return undefined;
      return {
        index,
        total: rowsNow.length,
        prev: rowsNow[index - 1],
        next: rowsNow[index + 1],
      };
    });

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)?.navigation;

  it("locates a deep-linked row past the page loaded, and steps from it", async () => {
    const locate = locateIn(() => allRows);
    const targets = mountTargets(ref(allRows.slice(0, 2)), {
      total: () => allRows.length,
      locate,
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[4],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({
        index: 4,
        total: 6,
        hasPrev: true,
        hasNext: true,
      }),
    );
    expect(locate).toHaveBeenCalledWith("q4", undefined);
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("q5"));
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 5, hasNext: false }),
    );
  });

  it("follows live rows by id: never revisits a row, keeps the position", async () => {
    const live = ref<Row[]>(allRows.slice(0, 3));
    const targets = mountTargets(live, {
      total: () => live.value.length,
      locate: locateIn(() => live.value),
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;

    live.value = [{ _id: "new", name: "New" }, ...live.value];
    expect(navigationOf(drawer)).toMatchObject({ index: 2, total: 4 });
    press("j");
    expect(latest(drawer).componentKey).toBe("q2");
    press("k");
    expect(latest(drawer).componentKey).toBe("q1");
  });

  it("locates the open row once live rows push it out of the rows loaded", async () => {
    const all = ref<Row[]>(allRows.slice(0, 4));
    const loaded = computed(() => all.value.slice(0, 2));
    const targets = mountTargets(loaded, {
      total: () => all.value.length,
      locate: locateIn(() => all.value),
    });
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      allRows[1],
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    all.value = [
      { _id: "a", name: "A" },
      { _id: "b", name: "B" },
      ...all.value,
    ];
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 3, total: 6 }),
    );
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("q2"));
  });
});
