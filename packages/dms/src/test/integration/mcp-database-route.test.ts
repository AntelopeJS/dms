import path from "node:path";
import {
  GetResponsibleModule,
  type InterfaceConnection,
} from "@antelopejs/interface-core";
import { internal } from "@antelopejs/interface-core/internal";
import { expect } from "chai";
import { z } from "zod";
import { createClient } from "../helpers/http";
import { readBridgeConfig } from "../helpers/mcp";

const CATALOG_INTERFACE = "@antelopejs/interface-database-catalog";
const OWN_MODULE = GetResponsibleModule() ?? "";
const HELPERS = path.join(__dirname, "..", "unit");
const SELECTED_PROVIDER = path.join(
  HELPERS,
  "builder",
  "helpers",
  "catalog-provider",
);
const SECOND_PROVIDER = path.join(
  HELPERS,
  "mcp",
  "helpers",
  "warehouse-catalog",
);

const CallAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })).min(1),
    isError: z.boolean().optional(),
  }),
});

let kept: InterfaceConnection[] | undefined;

function declare(declared: InterfaceConnection[]): void {
  internal.interfaceConnections[OWN_MODULE] ??= {};
  internal.interfaceConnections[OWN_MODULE][CATALOG_INTERFACE] = declared;
}

/**
 * A tool runs in the context of the module serving HTTP, with the builder off in this harness. The
 * `database_*` tools still read the DMS's own connections, both of them.
 */
describe("[integration] database MCP tools over the route", () => {
  const client = createClient();

  async function call(name: string, args: { connection?: string }) {
    const response = await client.post(
      "/dms/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      { headers: { authorization: `Bearer ${readBridgeConfig().token}` } },
    );
    const { result } = CallAnswerSchema.parse(response.data);
    return { text: result.content[0].text, isError: result.isError === true };
  }

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

  it("lists every connection the DMS declares", async () => {
    const { text, isError } = await call("database_connections", {});
    expect(isError, text).to.equal(false);
    const listed = z
      .array(z.object({ connection: z.string(), engine: z.string() }))
      .parse(JSON.parse(text));
    expect(listed).to.deep.equal([
      { connection: "shop", engine: "spec-engine" },
      { connection: "warehouse", engine: "warehouse-engine" },
    ]);
  });

  it("lists the relations of the connection the catalog import does not select", async () => {
    const { text, isError } = await call("database_relations", {
      connection: "warehouse",
    });
    expect(isError, text).to.equal(false);
    const listed = z
      .array(z.object({ schema: z.string(), name: z.string() }))
      .parse(JSON.parse(text));
    expect(listed.map(({ schema, name }) => `${schema}.${name}`)).to.deep.equal(
      ["inventory.stock"],
    );
  });
});
