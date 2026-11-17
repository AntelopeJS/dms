import path from "node:path";
import {
  GetResponsibleModule,
  type InterfaceConnection,
} from "@antelopejs/interface-core";
import { internal } from "@antelopejs/interface-core/internal";
import { expect } from "chai";
import {
  catalogOf,
  listCatalogConnections,
} from "../../../implementations/dms-builder/engine";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";
const PROVIDER = path.join(__dirname, "helpers", "catalog-provider");
const NOT_A_PROVIDER = path.join(__dirname, "helpers", "file-text");
const OWN_MODULE = GetResponsibleModule() ?? "";

let kept: InterfaceConnection[] | undefined;

function declare(connections: InterfaceConnection[]): void {
  internal.interfaceConnections[OWN_MODULE] ??= {};
  internal.interfaceConnections[OWN_MODULE][CATALOG_INTERFACE] = connections;
}

/**
 * A provider module exports the catalog's six functions and nothing else; the sample limits live
 * in `@antelopejs/interface-database-catalog` and belong to no provider.
 */
describe("a declared catalog connection", () => {
  beforeEach(() => {
    kept = internal.interfaceConnections[OWN_MODULE]?.[CATALOG_INTERFACE];
  });

  afterEach(() => {
    if (kept === undefined) {
      delete internal.interfaceConnections[OWN_MODULE]?.[CATALOG_INTERFACE];
    } else {
      declare(kept);
    }
  });

  it("is served by a provider that exports only the catalog functions", async () => {
    declare([{ id: "main", path: PROVIDER, selected: true }]);
    const info = await catalogOf("main")?.Info();
    expect(info?.engine).to.equal("spec-engine");
  });

  it("lists the connection by its id", () => {
    declare([{ id: "main", path: PROVIDER, selected: true }]);
    expect(listCatalogConnections()).to.deep.equal(["main"]);
  });

  it("refuses a provider that lacks the catalog functions", () => {
    declare([{ id: "partial", path: NOT_A_PROVIDER, selected: true }]);
    expect(() => catalogOf("partial")).to.throw(
      TypeError,
      "does not export the catalog functions",
    );
  });
});
