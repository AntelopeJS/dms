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
import { setCatalogConnectionsForTests } from "../../../implementations/dms-builder/engine";
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
const CONFIGURE = "builder_configure_project";

const ToolAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

const ErrorReplySchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

/** One ConfigureModule step writing these accesses on the dms-database entry. */
function accessSteps(accesses: Record<string, string>) {
  const externalConnections = Object.fromEntries(
    Object.entries(accesses).map(([id, access]) => [id, { access }]),
  );
  return {
    steps: [
      {
        op: "ConfigureModule",
        id: "dms-database",
        entry: { config: { externalConnections } },
      },
    ],
  } satisfies { steps: ProjectConfigStep[] };
}

function reply(access: McpAccess, args: JsonValue) {
  return answerMcpMessage(
    { access, tools: MCP_TOOLS },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: CONFIGURE, arguments: args },
    },
  );
}

/** Calls the tool twice in full mode, as the repeat-confirmation gate asks; answers the second. */
async function confirmedCall(args: JsonValue) {
  await reply("full", args);
  return ToolAnswerSchema.parse(await reply("full", args)).result;
}

describe("[unit] builder_configure_project never raises a connection's access", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  it("refuses raising it in full mode, naming the two owner routes", async () => {
    setConnectionAccess({ erp: "read" });
    const answer = await confirmedCall(accessSteps({ erp: "read-write" }));
    expect(answer.isError).to.equal(true);
    const text = answer.content[0]?.text ?? "";
    expect(text).to.include(
      `set the access of connection \\"erp\\" to \\"read-write\\": ${RAISE_REFUSED}`,
    );
    expect(text).to.include("PUT /api/database/connections/<id>/access");
    expect(text).to.include("POST /database/project");
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("is not served in safe mode", async () => {
    setConnectionAccess({ erp: "read" });
    const { error } = ErrorReplySchema.parse(
      await reply("safe", accessSteps({ erp: "read-write" })),
    );
    expect(error.message).to.include("not available in Safe mode");
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("lowers it to read", async () => {
    setConnectionAccess({ erp: "read-write" });
    const answer = await confirmedCall(accessSteps({ erp: "read" }));
    expect(answer.isError, answer.content[0]?.text).to.equal(undefined);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("lowers one connection while restating another's unchanged read-write", async () => {
    setConnectionAccess({ erp: "read-write", archive: "read-write" });
    const answer = await confirmedCall(
      accessSteps({ erp: "read", archive: "read-write" }),
    );
    expect(answer.isError, answer.content[0]?.text).to.equal(undefined);
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses a variable supplying it", async () => {
    setConnectionAccess({ erp: "read" });
    const answer = await confirmedCall({
      steps: [
        {
          op: "ConfigureModule",
          id: "dms-database",
          entry: { env: { "externalConnections.erp.access": "ERP_ACCESS" } },
        },
      ],
    });
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(
      `supply \`config.externalConnections.erp.access\` from a variable: ${RAISE_REFUSED}`,
    );
  });

  it("leaves the interface, the owner routes' path, able to grant it", async () => {
    setConnectionAccess({ erp: "read" });
    expectOk(
      await ConfigureModule("dms-database", {
        config: { externalConnections: { erp: { access: "read-write" } } },
      }),
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

  it("leaves it as it was when the configuration loads the .env itself while it is evaluated", async () => {
    erp.app().write("../.env", "ANT_2283_LOADED=from-dotenv\n");
    erp.writeModules(
      [
        '"dms-database": { source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }, config: { externalConnections: { erp: { access: "read" } } } },',
      ],
      [],
      [
        'import { existsSync } from "node:fs";',
        'import { join } from "node:path";',
        "",
        'const projectEnvFile = join(__dirname, ".env");',
        "if (existsSync(projectEnvFile)) {",
        "  process.loadEnvFile(projectEnvFile);",
        "}",
      ],
    );
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(process.env.ANT_2283_LOADED).to.equal(undefined);
  });
});
