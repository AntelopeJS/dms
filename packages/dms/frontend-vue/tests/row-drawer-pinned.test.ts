/** @vitest-environment jsdom */
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useTableRows } from "../layers/dms-ui/app/entries/composables/table-view/useTableRows";
import { rowLocator } from "../layers/dms-ui/app/entries/composables/table-view/utils/locateRow";
import {
  type OpenedDrawer,
  opened,
  drawerAction,
  mountTargets,
  latest,
  headerOf,
  press,
} from "./row-drawer-runtime";

describe("a row drawer on a table with pinned rows", () => {
  const PAGE_SIZE = 3;

  const answered = Array.from({ length: 7 }, (_, index) => ({
    _id: `v${index}`,
    name: `Row ${index}`,
    isVip: index === 1 || index === 4,
  }));

  const shownOrder = ["v1", "v0", "v2", "v4", "v3", "v5", "v6"];
  const byId = (id: string) => answered.find((row) => row._id === id)!;
  const pageRows = (pageIndex: number) =>
    shownOrder
      .slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
      .map(byId);

  function secondPage() {
    const rowsRead = useTableRows({
      // SAFETY: The list client is invoked only with this query shape and consumes only results and total from the reply.
      api: (async (
        _url: string,
        { query }: { query: Record<string, number> },
      ) => ({
        results: answered.slice(query.offset, query.offset + query.limit),
        total: answered.length,
      })) as Parameters<typeof useTableRows>[0]["api"],
      location: "/api/customers",
      columns: [],
      pinnedRows: () => ({ field: "isVip", equals: true }),
    });
    const locate = rowLocator({
      list: async (offset, limit) => {
        const page = await rowsRead.listAsShown({ offset, limit }, PAGE_SIZE);
        return page && { results: page.results, total: page.total };
      },
      rowIdKey: "_id",
    });
    const loadAdjacent = vi.fn(async () => false);
    const targets = mountTargets(ref(pageRows(1)), {
      total: () => answered.length,
      offset: () => PAGE_SIZE,
      loadAdjacent,
      locate,
    });
    return { targets, loadAdjacent };
  }

  const navigationOf = (drawer: OpenedDrawer) => headerOf(drawer)?.navigation;

  it("places a clicked row where the table shows it, and steps in its order", async () => {
    const { targets, loadAdjacent } = secondPage();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      byId("v3"),
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;
    expect(navigationOf(drawer)).toMatchObject({ index: 4, total: 7 });
    press("k");
    expect(latest(drawer).componentKey).toBe("v4");
    expect(navigationOf(drawer)).toMatchObject({ index: 3 });
    press("j");
    press("j");
    expect(latest(drawer).componentKey).toBe("v5");
    expect(navigationOf(drawer)).toMatchObject({ index: 5 });

    expect(loadAdjacent).not.toHaveBeenCalled();
  });

  it("places a deep-linked row off the page as the table shows it, keeping the page", async () => {
    const { targets, loadAdjacent } = secondPage();
    targets.handleCustomRowAction(
      drawerAction({ positionLabel: "$p" }),
      byId("v2"),
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const drawer = opened[0]!;

    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({
        index: 2,
        total: 7,
        hasPrev: true,
        hasNext: true,
      }),
    );
    press("j");
    await vi.waitFor(() => expect(latest(drawer).componentKey).toBe("v4"));
    await vi.waitFor(() =>
      expect(navigationOf(drawer)).toMatchObject({ index: 3 }),
    );
    expect(loadAdjacent).not.toHaveBeenCalled();
  });
});
