import path from "node:path";
import {
  GetResponsibleModule,
  type InterfaceConnection,
} from "@antelopejs/interface-core";
import { internal } from "@antelopejs/interface-core/internal";
import { expect } from "chai";
import { z } from "zod";
import { mockupTool, run } from "../../helpers/mockup-mcp";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";
const OWN_MODULE = GetResponsibleModule() ?? "";
const SELECTED_PROVIDER = path.join(
  __dirname,
  "..",
  "builder",
  "helpers",
  "catalog-provider",
);
const SECOND_PROVIDER = path.join(__dirname, "helpers", "warehouse-catalog");

const relations = mockupTool("database_relations");
const connections = mockupTool("database_connections");

let kept: InterfaceConnection[] | undefined;

function declare(declared: InterfaceConnection[]): void {
  internal.interfaceConnections[OWN_MODULE] ??= {};
  internal.interfaceConnections[OWN_MODULE][CATALOG_INTERFACE] = declared;
}

/**
 * A project declares several catalog connections; the DMS's own import selects one of them. The
 * `database_*` tools read each by its id, so the second database is as visible as the first.
 */
describe("the database MCP tools", () => {
  beforeEach(() => {
    kept = internal.interfaceConnections[OWN_MODULE]?.[CATALOG_INTERFACE];
    declare([
      { id: "shop", path: SELECTED_PROVIDER, selected: true },
      { id: "warehouse", path: SECOND_PROVIDER, selected: false },
    ]);
  });

  afterEach(() => {
    if (kept === undefined) {
      delete internal.interfaceConnections[OWN_MODULE]?.[CATALOG_INTERFACE];
    } else {
      declare(kept);
    }
  });

  it("lists the relations of a connection the catalog import does not select", async () => {
    const { text, isError } = await run(relations, { connection: "warehouse" });
    expect(isError, text).to.equal(false);
    const listed = z
      .array(z.object({ schema: z.string(), name: z.string() }))
      .parse(JSON.parse(text));
    expect(listed.map(({ schema, name }) => `${schema}.${name}`)).to.deep.equal(
      ["inventory.stock"],
    );
  });

  it("describes every declared connection through its own provider", async () => {
    const { text, isError } = await run(connections, {});
    expect(isError, text).to.equal(false);
    const described = z
      .array(z.object({ connection: z.string(), engine: z.string() }))
      .parse(JSON.parse(text));
    expect(described).to.deep.equal([
      { connection: "shop", engine: "spec-engine" },
      { connection: "warehouse", engine: "warehouse-engine" },
    ]);
  });

  it("names the declared connections when asked for another", async () => {
    const { text, isError } = await run(relations, { connection: "erp" });
    expect(isError).to.equal(true);
    expect(JSON.parse(text)).to.deep.equal({
      ok: false,
      error: {
        code: "unknown_connection",
        connection: "erp",
        known: ["shop", "warehouse"],
      },
    });
  });
});
