import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
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
  recordLaunchEnvironment,
  setCatalogConnectionsForTests,
} from "../../../implementations/dms-builder/engine";
import { expectOk, setConnectionAccess } from "./harness";
import {
  confirmedCall,
  countries,
  RAISE_REFUSED,
  READ_ONLY,
  refusalOf,
  reply,
  useErpFixture,
} from "./helpers/connection-access";
import { FAKE_CATALOG, OP_TIMEOUT } from "./mapped-database";

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

describe("[unit] builder_configure_project never writes read-write into a base that does not hold it", function () {
  this.timeout(OP_TIMEOUT);
  useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  afterEach(() => {
    recordLaunchEnvironment(undefined);
    delete process.env.ERP_ACCESS;
  });

  it("refuses the restatement when only an environment layer grants read-write", async () => {
    setConnectionAccess(
      { erp: "read" },
      '  environments: { development: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "read-write" } } } } } } },\n',
    );
    recordLaunchEnvironment("development");
    expectOk(await MapResources(countries(true)), "writable in development");
    const answer = await confirmedCall(accessSteps({ erp: "read-write" }));
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(RAISE_REFUSED);
    recordLaunchEnvironment("production");
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });

  it("refuses the restatement when only an envOverrides variable grants read-write", async () => {
    setConnectionAccess(
      { erp: "read" },
      '  envOverrides: { ERP_ACCESS: "modules.dms-database.config.externalConnections.erp.access" },\n',
    );
    process.env.ERP_ACCESS = "read-write";
    expectOk(
      await MapResources(countries(true)),
      "writable through the variable",
    );
    const answer = await confirmedCall(accessSteps({ erp: "read-write" }));
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(RAISE_REFUSED);
    delete process.env.ERP_ACCESS;
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
  });
});

const DMS_DATABASE_SOURCE =
  'source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }';

/** A dms-database entry whose `erp` access is written as `access`, verbatim. */
function dmsDatabaseWith(access: string): string {
  return `"dms-database": { ${DMS_DATABASE_SOURCE}, config: { externalConnections: { erp: { access: ${access} } } } },`;
}

describe("[unit] builder_configure_project reads the access as antelope.config.ts writes it", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();

  before(() => {
    ImplementInterface(Builder, implementation);
  });

  afterEach(() => {
    delete process.env.ERP_ACCESS;
  });

  /** What restating `erp` as `read-write` answers: the refusal, or "accepted". */
  async function restatement(): Promise<string> {
    const answer = await confirmedCall(accessSteps({ erp: "read-write" }));
    return answer.isError === true
      ? (answer.content[0]?.text ?? "")
      : "accepted";
  }

  it("refuses replacing an access read from a variable", async () => {
    process.env.ERP_ACCESS = "read-write";
    erp.writeModules([dmsDatabaseWith('process.env.ERP_ACCESS ?? "read"')]);
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses replacing an access that branches on the launch environment", async () => {
    erp.writeModules([
      dmsDatabaseWith(
        'process.env.ANTELOPEJS_LAUNCH_ENV === "production" ? "read" : "read-write"',
      ),
    ]);
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses replacing a template an environment lowers", async () => {
    erp.writeModules(
      [
        `"dms-database": { ${DMS_DATABASE_SOURCE}, config: { erpAccess: "read-write", externalConnections: { erp: { access: "\${erpAccess}" } } } },`,
      ],
      [
        'environments: { production: { modules: { "dms-database": { config: { erpAccess: "read" } } } } },',
      ],
    );
    expect(await restatement()).to.include(RAISE_REFUSED);
  });

  it("refuses rebinding a variable envOverrides maps to an access, in array form", async () => {
    erp.writeModules(
      [dmsDatabaseWith('"read-write"')],
      [
        'envOverrides: { ERP_LOCK: ["modules.dms-database.config.externalConnections.erp.access"] },',
      ],
    );
    const answer = await confirmedCall({
      steps: [
        {
          op: "ConfigureModule",
          id: "dms-database",
          entry: { env: { pollSeconds: "ERP_LOCK" } },
        },
      ],
    });
    expect(answer.isError).to.equal(true);
    expect(answer.content[0]?.text).to.include(
      `rebind \`ERP_LOCK\`, which \`envOverrides\` maps to a connection's access: ${RAISE_REFUSED}`,
    );
  });

  it("leaves no variable bound in array form to be rebound through the interface", async () => {
    erp.writeModules(
      [dmsDatabaseWith('"read-write"')],
      [
        'envOverrides: { ERP_LOCK: ["modules.dms-database.config.externalConnections.erp.access"] },',
      ],
    );
    expect(
      refusalOf(
        await ConfigureModule("dms-database", {
          env: { pollSeconds: "ERP_LOCK" },
        }),
      ),
    ).to.include("ERP_LOCK already supplies");
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

  it("leaves it as it was when the configuration loads another env file itself", async () => {
    erp.app().write("../.env.local", "ANT_2283_LOCAL=from-env-local\n");
    erp.writeModules(
      [dmsDatabaseWith('"read"')],
      [],
      [
        'import { join } from "node:path";',
        "",
        'process.loadEnvFile(join(__dirname, ".env.local"));',
      ],
    );
    expect(refusalOf(await MapResources(countries(true)))).to.include(
      READ_ONLY,
    );
    expect(process.env.ANT_2283_LOCAL).to.equal(undefined);
  });

  it("keeps a variable other code sets while a load is in flight", async () => {
    erp.writeModules(
      [
        '"dms-database": { source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }, config: { externalConnections: { erp: { access: "read" } } } },',
      ],
      [],
      [
        "setImmediate(() => {",
        '  process.env.ANT_2283_OTHER = "set-by-other-code";',
        "});",
      ],
    );
    try {
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        READ_ONLY,
      );
      expect(process.env.ANT_2283_OTHER).to.equal("set-by-other-code");
    } finally {
      delete process.env.ANT_2283_OTHER;
    }
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
