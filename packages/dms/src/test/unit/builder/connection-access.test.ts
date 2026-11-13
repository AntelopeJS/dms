import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  MapResources,
  PreviewMapResources,
} from "../../../implementations/dms-builder";
import { answerMcpMessage } from "../../../mcp/protocol";
import { MCP_TOOLS } from "../../../mcp/tools";
import { expectOk, setConnectionAccess } from "./harness";
import {
  COUNTRIES_API,
  countries,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { MODULE, OP_TIMEOUT } from "./mapped-database";

const ToolAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    issues: z.array(z.object({ message: z.string() })),
  }),
});

describe("[unit] mapping a relation follows its connection's access", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  it("refuses write routes on a connection dms-database does not register, saying how to allow them", async () => {
    for (const result of [
      await PreviewMapResources(countries(true)),
      await MapResources(countries(true)),
    ]) {
      const message = refusalOf(result);
      expect(message).to.include(READ_ONLY);
      expect(message).to.include("sales.countries");
      expect(message).to.include("config.externalConnections.erp");
      expect(message).to.include("Read & write");
      expect(message).to.include("`writable: false`");
    }
    expect(
      erp.app().exists(`../modules/${MODULE}/src/${COUNTRIES_API}`),
    ).to.equal(false);
  });

  it("maps read-only on a read connection, serving no write route", async () => {
    setConnectionAccess({ erp: "read" });
    expectOk(await MapResources(countries(false)), "read-only mapping");
    expect(erp.moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.All");
  });

  it("refuses write routes while the access is read, and writes them once it is read-write", async () => {
    setConnectionAccess({ erp: "read" });
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      `${READ_ONLY}, since \`config.externalConnections.erp.access\` of the dms-database module is "read" for the "default" environment`,
    );
    expect(erp.moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.All");

    setConnectionAccess({ erp: "read-write" });
    expectOk(await MapResources(countries(true)), "writable mapping");
    expect(erp.moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.All");
  });

  it("refuses write routes named under another connection on a module bound to a read one", async () => {
    setConnectionAccess({ erp: "read", other: "read-write" });
    expect(
      refusalOf(
        await MapResources({ ...countries(true), connection: "other" }),
      ),
    ).to.include(READ_ONLY);
    expect(erp.moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.All");
  });

  it("maps a stats-only relation sent as writable on a read connection, since it serves no route", async () => {
    setConnectionAccess({ erp: "read" });
    const planned = expectOk(
      await PreviewMapResources(countries(true, false)),
      "stats-only mapping",
    );
    expect(planned.pagesToRemove).to.have.length(1);
  });
});

describe("[unit] builder_map_resources through the MCP server follows the access", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  async function callTool(name: string, args: ReturnType<typeof countries>) {
    const reply = await answerMcpMessage(
      { access: "safe", tools: MCP_TOOLS },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      },
      "test-session",
    );
    return ToolAnswerSchema.parse(reply).result;
  }

  it("answers the refusal on a read connection, and maps once it is read-write", async () => {
    setConnectionAccess({ erp: "read" });
    const refused = await callTool("builder_map_resources", countries(true));
    expect(refused.isError).to.equal(true);
    const { error } = RefusalSchema.parse(
      JSON.parse(refused.content[0]?.text ?? "null"),
    );
    expect(error.code).to.equal("invalid_config");
    expect(error.issues[0]?.message).to.include(READ_ONLY);

    setConnectionAccess({ erp: "read-write" });
    const mapped = await callTool("builder_map_resources", countries(true));
    expect(mapped.isError, mapped.content[0]?.text).to.equal(undefined);
  });
});
