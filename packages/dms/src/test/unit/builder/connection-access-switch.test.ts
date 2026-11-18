import { ImplementInterface } from "@antelopejs/interface-core";
import type { RelationWrites } from "@antelopejs/interface-database-catalog";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import * as Builder from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  type CatalogConnection,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import { CONFIRMATION_REQUIRED_CODE } from "../../../mcp/confirmation-gate";
import { mockupTool } from "../../helpers/mockup-mcp";
import {
  type ConnectionAccessConfig,
  createFixture,
  destroyFixture,
  type Fixture,
} from "./harness";
import { READ_ONLY } from "./helpers/connection-access";
import { CONNECTION, ERP_CONNECTION, ORDERS } from "./helpers/mapped-orders";
import { MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";

const SESSION = "connection-access-switch";
const ORDERS_API = `../modules/${MODULE}/src/erp/orders/data-api.ts`;
const ROW_WRITE_ROUTES = /TableViewRoutes\.(All|New|Edit|Delete)\b/;
const NO_WRITE_GRANT =
  "its database account may not insert, update or delete rows in any table";

const AccessAnswerSchema = z.object({
  access: z.enum(["read", "read-write"]),
});
const CodeSchema = z.object({ code: z.string() });
const IssuesSchema = z.object({
  error: z.object({ issues: z.array(z.object({ message: z.string() })) }),
});
const RefusalSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), detail: z.string() }),
});

interface ToolAnswer {
  texts: string[];
  isError: boolean;
}

async function call(name: string, args: JsonValue): Promise<ToolAnswer> {
  const answer = await mockupTool(name).call(args, SESSION);
  return {
    texts: answer.content.map(({ text }) => text),
    isError: answer.isError === true,
  };
}

function succeeded({ texts, isError }: ToolAnswer): string {
  expect(isError, texts.join("\n")).to.equal(false);
  return texts[0] ?? "";
}

function accessOf(answer: ToolAnswer): string {
  return AccessAnswerSchema.parse(JSON.parse(succeeded(answer))).access;
}

function expectHeld({ texts, isError }: ToolAnswer): void {
  expect(isError, texts.join("\n")).to.equal(true);
  expect(CodeSchema.parse(JSON.parse(texts.at(-1) ?? "null"))).to.deep.equal({
    code: CONFIRMATION_REQUIRED_CODE,
  });
}

function refusalOf({ texts, isError }: ToolAnswer) {
  expect(isError, texts.join("\n")).to.equal(true);
  return RefusalSchema.parse(JSON.parse(texts[0] ?? "null")).error;
}

function orders(writable: boolean): JsonValue {
  return {
    module: MODULE,
    connection: CONNECTION,
    resources: [
      {
        relation: ORDERS,
        tableView: true,
        writable,
        fields: [{ column: "id" }, { column: "status" }],
      },
    ],
  };
}

function setAccess(access: "read" | "read-write"): Promise<ToolAnswer> {
  return call("builder_set_connection_access", {
    connection: CONNECTION,
    access,
  });
}

/** `ERP_CONNECTION` with an account that may make these writes in every relation. */
function accountWriting(writes: RelationWrites): Partial<CatalogConnection> {
  const described = async () =>
    (await ERP_CONNECTION.DescribeRelations()).map((relation) => ({
      ...relation,
      writes,
    }));
  return {
    ...ERP_CONNECTION,
    ListRelations: described,
    DescribeRelations: described,
  };
}

const WRITES_ROWS = accountWriting({
  insert: true,
  update: true,
  delete: true,
});
const WRITES_NO_ROW = accountWriting({
  insert: false,
  update: false,
  delete: false,
});
const UNREACHABLE: Partial<CatalogConnection> = {
  ...ERP_CONNECTION,
  ListRelations: () => Promise.reject(new Error("connection reset")),
};

describe("[unit] builder_set_connection_access writes the access the person agreed to", function () {
  this.timeout(OP_TIMEOUT);
  let app: Fixture;

  function useProject(
    access: ConnectionAccessConfig,
    catalog: Partial<CatalogConnection>,
  ): void {
    app = createFixture({ modules: [MODULE], connectionAccess: access });
    setCatalogConnectionsForTests({ [CONNECTION]: catalog });
  }

  function config(): string {
    return app.read("../antelope.config.ts");
  }

  before(() => {
    ImplementInterface(Builder, implementation);
    setModuleReloadForTests(reloadedAtOnce);
  });

  afterEach(() => {
    setCatalogConnectionsForTests();
    destroyFixture();
  });

  after(() => {
    setModuleReloadForTests();
  });

  it("takes a read connection's table from read-only to one that adds, edits and deletes rows, once the call is repeated", async () => {
    useProject({ [CONNECTION]: "read" }, WRITES_ROWS);
    expect(
      accessOf(
        await call("builder_analyse_database", {
          connection: CONNECTION,
          module: MODULE,
        }),
      ),
    ).to.equal("read");

    succeeded(await call("builder_map_resources", orders(false)));
    expect(app.read(ORDERS_API)).to.not.match(ROW_WRITE_ROUTES);
    const refused = await call("builder_map_resources", orders(true));
    expect(refused.isError).to.equal(true);
    const [issue] = IssuesSchema.parse(JSON.parse(refused.texts[0] ?? "null"))
      .error.issues;
    expect(issue?.message).to.include(READ_ONLY);
    expect(issue?.message).to.include("builder_set_connection_access");

    expectHeld(await setAccess("read-write"));
    expect(config()).to.not.include('"read-write"');

    expect(accessOf(await setAccess("read-write"))).to.equal("read-write");
    expect(config()).to.include('"read-write"');
    expect(
      accessOf(
        await call("builder_mapping", {
          connection: CONNECTION,
          module: MODULE,
        }),
      ),
    ).to.equal("read-write");

    succeeded(await call("builder_map_resources", orders(true)));
    expect(app.read(ORDERS_API)).to.include("TableViewRoutes.All");
  });

  it("refuses read-write while the database account writes no table, and holds nothing to repeat", async () => {
    useProject({ [CONNECTION]: "read" }, WRITES_NO_ROW);
    for (const answer of [
      await setAccess("read-write"),
      await setAccess("read-write"),
    ]) {
      const error = refusalOf(answer);
      expect(error.code).to.equal("invalid_config");
      expect(error.detail).to.include(
        `refused to allow changes on connection "${CONNECTION}": ${NO_WRITE_GRANT}`,
      );
    }
    expect(config()).to.not.include('"read-write"');
  });

  it("refuses read-write when the catalog cannot say what the account writes", async () => {
    useProject({ [CONNECTION]: "read" }, UNREACHABLE);
    const error = refusalOf(await setAccess("read-write"));
    expect(error.detail).to.include(
      "could not check what its database account may write, since its catalog answered: connection reset",
    );
    expect(config()).to.not.include('"read-write"');
  });

  it("lowers an access to read whatever the account may write", async () => {
    useProject({ [CONNECTION]: "read-write" }, WRITES_NO_ROW);
    expectHeld(await setAccess("read"));
    expect(accessOf(await setAccess("read"))).to.equal("read");
    expect(config()).to.not.include('"read-write"');
  });

  it("refuses a connection the project does not declare", async () => {
    useProject({ [CONNECTION]: "read" }, WRITES_ROWS);
    const error = refusalOf(
      await call("builder_set_connection_access", {
        connection: "crm",
        access: "read",
      }),
    );
    expect(error.code).to.equal("not_found");
    expect(error.detail).to.include('no catalog connection "crm"');
  });
});
