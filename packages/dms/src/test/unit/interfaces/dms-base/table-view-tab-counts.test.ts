import { DefaultRoutes } from "@antelopejs/interface-data-api";
import {
  resolveTabCountMode,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { expect } from "chai";

type Endpoints = Parameters<typeof resolveTabCountMode>[0];

// Mirrors what `DataController` stores for each key of the route map.
function mount(routes: Record<string, unknown>): Endpoints {
  return Object.fromEntries(
    Object.entries(routes).map(([key, route]) => [
      key,
      "func" in (route as object)
        ? { endpoint: key, callback: route }
        : { endpoint: key, ...(route as object) },
    ]),
  ) as Endpoints;
}

describe("[unit] table view tab count mode", () => {
  it("uses the batch route of a controller mounting every route", () => {
    expect(resolveTabCountMode(mount(TableViewRoutes.All))).to.equal("batch");
  });

  it("finds the batch route whatever key mounts it", () => {
    const endpoints = mount({ counters: TableViewRoutes.CountBatch });
    expect(resolveTabCountMode(endpoints)).to.equal("batch");
  });

  it("falls back to the single count of a hand-picked route map", () => {
    const endpoints = mount({
      get: TableViewRoutes.Get,
      list: TableViewRoutes.List,
      count: TableViewRoutes.Count,
    });
    expect(resolveTabCountMode(endpoints)).to.equal("single");
  });

  it("reports no counter route when the controller mounts none", () => {
    const endpoints = mount({
      get: TableViewRoutes.Get,
      list: TableViewRoutes.List,
    });
    expect(resolveTabCountMode(endpoints)).to.equal("none");
  });

  it("ignores a route mounted at the count path with another method", () => {
    const endpoints = mount({
      count: DefaultRoutes.WithOptions(TableViewRoutes.New, {}, "count"),
    });
    expect(resolveTabCountMode(endpoints)).to.equal("none");
  });
});
