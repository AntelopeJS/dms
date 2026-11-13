import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  ConfigureModule,
  MapResources,
  PreviewMapResources,
} from "../../../implementations/dms-builder";
import {
  configureProject,
  setCatalogConnectionsForTests,
} from "../../../implementations/dms-builder/engine";
import type { McpAccess } from "../../../mcp/access";
import { answerMcpMessage } from "../../../mcp/protocol";
import { MCP_TOOLS } from "../../../mcp/tools";
import { expectOk, setConnectionAccess } from "./harness";
import {
  countries,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { FAKE_CATALOG, OP_TIMEOUT } from "./mapped-database";

const RAISE_REFUSED = "an agent never raises a connection's access";

const ToolAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

function erpAccessStep(access: string) {
  return {
    steps: [
      {
        op: "ConfigureModule",
        id: "dms-database",
        entry: { config: { externalConnections: { erp: { access } } } },
      },
    ],
  } satisfies { steps: ProjectConfigStep[] };
}

const ErrorReplySchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

function reply(access: McpAccess, name: string, args: JsonValue) {
  return answerMcpMessage(
    { access, tools: MCP_TOOLS },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    },
  );
}

/** Calls a tool twice, as the repeat-confirmation gate asks, and answers the second call. */
async function confirmedCall(name: string, args: JsonValue) {
  await reply("full", name, args);
  return ToolAnswerSchema.parse(await reply("full", name, args)).result;
}

describe("[unit] an agent never raises a connection's access", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("refuses builder_configure_project raising it in full mode, naming who may grant it", async () => {
    setConnectionAccess({ erp: "read" });
    const answer = await confirmedCall(
      "builder_configure_project",
      erpAccessStep("read-write"),
    );
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(
      `set the access of connection \\"erp\\" to \\"read-write\\": ${RAISE_REFUSED}`,
    );
    expect(answer.content[0]?.text).to.include("the assistant's connect step");
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses builder_configure_project raising it in safe mode", async () => {
    setConnectionAccess({ erp: "read" });
    const { error } = ErrorReplySchema.parse(
      await reply(
        "safe",
        "builder_configure_project",
        erpAccessStep("read-write"),
      ),
    );
    expect(error.message).to.include("not available in Safe mode");
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("lets builder_configure_project lower it to read", async () => {
    setConnectionAccess({ erp: "read-write" });
    const answer = await confirmedCall(
      "builder_configure_project",
      erpAccessStep("read"),
    );
    expect(answer.isError, answer.content[0]?.text).to.equal(undefined);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses a variable supplying it", async () => {
    setConnectionAccess({ erp: "read" });
    expect(
      refusalOf(
        await ConfigureModule("dms-database", {
          env: { "externalConnections.erp.access": "ERP_ACCESS" },
        }),
      ),
    ).to.include(
      `supply \`config.externalConnections.erp.access\` from a variable: ${RAISE_REFUSED}`,
    );
  });

  it("leaves the engine's configureProject, the owner route's entry, able to grant it", async () => {
    setConnectionAccess({ erp: "read" });
    expectOk(
      configureProject(erpAccessStep("read-write").steps),
      "an owner's grant",
    );
    expectOk(await MapResources(countries(true)), "writable mapping");
  });
});

describe("[unit] each operation reads the configuration it loaded", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  it("refuses an operation that loaded read, though a later one loads read-write before its guard runs", async () => {
    let entered: () => void = () => undefined;
    let release: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = false;
    setCatalogConnectionsForTests({
      erp: {
        ...FAKE_CATALOG,
        async DescribeRelations(relations: string[]) {
          if (!held) {
            held = true;
            entered();
            await gate;
          }
          return FAKE_CATALOG.DescribeRelations?.(relations) ?? [];
        },
      },
    });
    setConnectionAccess({ erp: "read" });
    const earlier = MapResources(countries(true));
    await reached;
    setConnectionAccess({ erp: "read-write" });
    expectOk(
      await PreviewMapResources(countries(true)),
      "a later preview on read-write",
    );
    release();
    expect(refusalOf(await earlier)).to.include(READ_ONLY);
  });

  it("leaves the server's environment as it was when the project's .env holds variables", async () => {
    erp.app().write("../.env", "ANT_2283_PROBE=from-dotenv\n");
    setConnectionAccess({ erp: "read" });
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(process.env.ANT_2283_PROBE).to.equal(undefined);
  });
});
