import { ImplementInterface } from "@antelopejs/interface-core";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import * as Builder from "@antelopejs/interface-dms-builder";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  configureProjectWithVariables,
  setCatalogConnectionsForTests,
  startAnalysis,
} from "../../../implementations/dms-builder/engine";
import { mockupTool } from "../../helpers/mockup-mcp";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { ERP_CONNECTION } from "./helpers/mapped-orders";

const OP_TIMEOUT = 120_000;
const SESSION = "analyse-bound-modules";
const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";

const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), detail: z.string() }),
});
const IssuesSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    issues: z.array(z.object({ message: z.string() })),
  }),
});

/** The steps that connect `connection` through its own driver, its tables module made with it when named. */
function connectSteps(
  connection: string,
  tables: string | undefined,
): ProjectConfigStep[] {
  const driver = `builder-db-${connection}`;
  const catalog = {
    importOverrides: [{ interface: CATALOG, source: driver, id: connection }],
  };
  const tablesSteps: ProjectConfigStep[] =
    tables === undefined
      ? []
      : [
          {
            op: "CreateLocalModule",
            id: tables,
            path: `modules/${tables}`,
            entry: {
              importOverrides: [{ interface: DATABASE, source: driver }],
            },
            connection,
          },
        ];
  return [
    {
      op: "AddModule",
      id: driver,
      entry: {
        source: {
          type: "package",
          package: "@antelopejs/postgres",
          version: "^0.2.1",
        },
        config: { mode: "external" },
        env: { url: `BUILDER_DB_${connection.toUpperCase()}_URL` },
        exportPriority: { [DATABASE]: -1 },
      },
    },
    ...tablesSteps,
    { op: "ConfigureModule", id: "dms-builder", entry: catalog },
  ];
}

function connect(connection: string, tables?: string): void {
  expectOk(
    configureProjectWithVariables(connectSteps(connection, tables), [
      {
        name: `BUILDER_DB_${connection.toUpperCase()}_URL`,
        value: `postgres://reader@db.example:5432/${connection}`,
      },
    ]),
    `connecting ${connection}`,
  );
}

async function refusalOf(args: JsonValue) {
  const answer = await mockupTool("builder_analyse_database").call(
    args,
    SESSION,
  );
  expect(answer.isError).to.equal(true);
  return RefusalSchema.parse(JSON.parse(answer.content[0]?.text ?? "null"))
    .error;
}

/**
 * An analysis asked for a module that is not the one bound to the connection, or without a
 * module, answers which modules are bound to it, so the next call names the right one.
 */
describe("[unit] builder_analyse_database names the modules bound to the connection", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    ImplementInterface(Builder, implementation);
    createFixture({ modules: ["dms-builder"] });
    connect("erp", "erp-tables");
    connect("crm");
    setCatalogConnectionsForTests({ erp: ERP_CONNECTION, crm: ERP_CONNECTION });
  });

  after(() => {
    setCatalogConnectionsForTests();
    destroyFixture();
  });

  it("lists them beside an unknown module", () => {
    const answer = IssuesSchema.parse(
      startAnalysis({ connection: "erp", module: "erp" }),
    );
    expect(answer.error.code).to.equal("invalid_config");
    expect(answer.error.issues[0]?.message).to.equal(
      'analyse for a local module bound to the database, not unknown module "erp": the modules bound to "erp" are erp-tables',
    );
  });

  it("says when no module is bound to the connection yet", () => {
    const answer = IssuesSchema.parse(
      startAnalysis({ connection: "crm", module: "crm-tables" }),
    );
    expect(answer.error.issues[0]?.message).to.equal(
      'analyse for a local module bound to the database, not unknown module "crm-tables": no local module is bound to "crm" yet',
    );
  });

  it("lists them when the call names the connection without a module", async () => {
    expect(await refusalOf({ connection: "erp" })).to.deep.equal({
      code: "invalid_input",
      detail:
        'Pass `connection` and `module` to start an analysis, or `job` to read a running one. The modules bound to "erp" are erp-tables.',
    });
  });

  it("lists every connection with its modules when the call names neither", async () => {
    expect((await refusalOf({})).detail).to.equal(
      "Pass `connection` and `module` to start an analysis, or `job` to read a running one. The connections, with the modules bound to each: erp (erp-tables); crm (no module bound yet).",
    );
  });
});
