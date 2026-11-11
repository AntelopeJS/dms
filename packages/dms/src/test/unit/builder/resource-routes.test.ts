import { expect } from "chai";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view";
import type { ResourceRoute } from "@antelopejs/interface-dms-builder";
import {
  ConfigureResource,
  CreateResource,
  GetResourceStructure,
} from "../../../implementations/dms-builder";
import {
  RESOURCE_ROUTES,
  routeMapExpr,
  routesFromRouteMap,
} from "../../../implementations/dms-builder/engine/resource-emit";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const DATA_API_FILE = "ticket/data-api.ts";
const OP_TIMEOUT = 60_000;
const MEMBER = /(\w+): TableViewRoutes\.(\w+)/g;

const allKeys = Object.keys(TableViewRoutes.All);
const exportKeys = new Set(Object.keys(TableViewRoutes.ExportRoutes));
const members = new Map(Object.entries(TableViewRoutes));
const served = new Map(Object.entries(TableViewRoutes.All));

function without(route: ResourceRoute): ResourceRoute[] {
  return RESOURCE_ROUTES.filter((entry) => entry !== route);
}

/** The `key: TableViewRoutes.Member` pairs a literal route map names. */
function namedMembers(expr: string): Map<string, string> {
  return new Map(
    [...expr.matchAll(MEMBER)].map(([, key, member]) => [key, member]),
  );
}

/**
 * The route map is rewritten whenever a route is switched on or off, so every
 * key the DMS serves has to survive the trip: one the builder cannot name is
 * dropped from the resource for good, and nothing says so until the page that
 * read it breaks.
 */
describe("resource route maps", () => {
  it("names a route for every key TableViewRoutes.All serves", () => {
    for (const key of allKeys) {
      expect(routesFromRouteMap([key], false), key).to.have.length(1);
    }
  });

  it("writes every member back, each under the route All serves it as", () => {
    const named = namedMembers(routeMapExpr(without("export")));
    for (const key of allKeys.filter((entry) => !exportKeys.has(entry))) {
      const member = named.get(key);
      expect(member, `${key} is written back`).to.be.a("string");
      expect(members.get(String(member)), key).to.equal(served.get(key));
    }
  });

  it("writes TableViewRoutes.All once every route is served", () => {
    expect(routeMapExpr([...RESOURCE_ROUTES])).to.equal("TableViewRoutes.All");
    expect(routeMapExpr(undefined)).to.equal("TableViewRoutes.All");
  });

  describe("through a route toggle", () => {
    let app: Fixture;

    before(async function () {
      this.timeout(120_000);
      app = createFixture();
      expectOk(
        await CreateResource({
          name: "ticket",
          fields: [{ name: "title", dataType: { $dataType: "string" } }],
        }),
        "CreateResource",
      );
    });

    after(() => destroyFixture());

    it("keeps the tab counters and footer figures when the export is switched off", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(
        await ConfigureResource("ticket", { routes: without("export") }),
        "ConfigureResource",
      );

      const written = app.read(DATA_API_FILE);
      expect(written).to.contain("countBatch: TableViewRoutes.CountBatch");
      expect(written).to.contain("summary: TableViewRoutes.Summary");
      const structure = expectOk(
        await GetResourceStructure("ticket"),
        "GetResourceStructure",
      );
      expect(structure.routes).to.deep.equal(without("export"));
    });

    it("serves TableViewRoutes.All again once the export is back", async function () {
      this.timeout(OP_TIMEOUT);
      expectOk(
        await ConfigureResource("ticket", { routes: [...RESOURCE_ROUTES] }),
        "ConfigureResource",
      );

      expect(app.read(DATA_API_FILE)).to.contain("TableViewRoutes.All");
      const structure = expectOk(
        await GetResourceStructure("ticket"),
        "GetResourceStructure",
      );
      expect(structure.routes, "every route, as the full map").to.equal(
        undefined,
      );
    });
  });
});
