import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import type {
  MapResourcesInput,
  OpResult,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import {
  AddBlock,
  ConfigureBlock,
  ConfigureResource,
  CreateResource,
  GetPageStructure,
  ListPages,
  MapResources,
  PreviewMapResources,
} from "../../../implementations/dms-builder";
import {
  recordLaunchEnvironment,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
  PROJECT_MODULE,
  setConnectionAccess,
} from "./harness";
import { FAKE_CATALOG, MODULE, OP_TIMEOUT } from "./mapped-database";
import { reloadedAtOnce } from "./reload-stub";
import { answerMcpMessage } from "../../../mcp/protocol";
import { MCP_TOOLS } from "../../../mcp/tools";

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

const COUNTRIES = "erp/sales/countries";
const COUNTRIES_API = "sales/countries/data-api.ts";
const READ_ONLY = 'connection "erp" is read-only';
const CREATING = {
  routes: ["list", "get", "create"],
} satisfies { routes: ResourceRoute[] };

function countries(writable: boolean, tableView = true) {
  return {
    module: MODULE,
    connection: "erp",
    resources: [
      {
        relation: "sales.countries",
        label: "name",
        tableView,
        writable,
        fields: [{ column: "name" }],
      },
    ],
  } satisfies MapResourcesInput;
}

/** The message of an `invalid_config` refusal, or a failure naming what came back instead. */
function refusalOf(result: OpResult<unknown>): string {
  if (result.ok || result.error.code !== "invalid_config") {
    throw new Error(`expected invalid_config, got ${JSON.stringify(result)}`);
  }
  return result.error.issues.map(({ message }) => message).join("\n");
}

async function countriesPage(): Promise<string> {
  const page = (await ListPages()).find(({ id }) => id === "sales-countries");
  if (!page) {
    throw new Error("the countries page was not mapped");
  }
  return page.ref;
}

async function formMode(page: string, name: string) {
  const structure = expectOk(await GetPageStructure(page), "GetPageStructure");
  return structure.blocks.find((block) => block.name === name)?.config?.mode;
}

function form(page: string, name: string, mode: "new" | "edit" | "view") {
  return AddBlock({
    page,
    name,
    type: "ResourceForm",
    controller: COUNTRIES,
    config: { mode },
  });
}

describe("[unit] builder writes on an external connection follow its access", function () {
  this.timeout(OP_TIMEOUT);

  let app: Fixture;
  const moduleFile = (relative: string) =>
    app.read(`../modules/${MODULE}/src/${relative}`);

  before(() => {
    app = createFixture({ modules: [MODULE] });
    setCatalogConnectionsForTests({
      erp: FAKE_CATALOG,
      "erp.v2": FAKE_CATALOG,
      other: FAKE_CATALOG,
    });
    setModuleReloadForTests(reloadedAtOnce);
  });

  after(() => {
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });

  describe("mapping a relation", () => {
    it("refuses write routes on a connection dms-database does not register, saying how to allow them", async () => {
      for (const result of [
        await PreviewMapResources(countries(true)),
        await MapResources(countries(true)),
      ]) {
        const message = refusalOf(result);
        expect(message).to.include(READ_ONLY);
        expect(message).to.include("sales.countries");
        expect(message).to.include("config.externalConnections.erp.access");
        expect(message).to.include("Read & write");
        expect(message).to.include("`writable: false`");
      }
      expect(app.exists(`../modules/${MODULE}/src/${COUNTRIES_API}`)).to.equal(
        false,
      );
    });

    it("maps read-only on a read connection, serving no write route", async () => {
      setConnectionAccess({ erp: "read" });
      expectOk(await MapResources(countries(false)), "read-only mapping");
      expect(moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.All");
    });

    it("refuses write routes while the access is read, and writes them once it is read-write", async () => {
      setConnectionAccess({ erp: "read" });
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        READ_ONLY,
      );
      expect(moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.All");

      setConnectionAccess({ erp: "read-write" });
      expectOk(await MapResources(countries(true)), "writable mapping");
      expect(moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.All");
    });

    it("refuses write routes named under another connection on a module bound to a read one", async () => {
      setConnectionAccess({ erp: "read", other: "read-write" });
      expect(
        refusalOf(
          await MapResources({ ...countries(true), connection: "other" }),
        ),
      ).to.include(READ_ONLY);
      expect(moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.All");
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

  describe("an access core overrides at start", () => {
    const JSON_FILE = "../antelope.dms-database.json";
    const PATH = "modules.dms-database.config.externalConnections.erp.access";

    afterEach(() => {
      delete process.env.ERP_ACCESS;
      fs.rmSync(path.join(app.root, "antelope.dms-database.json"), {
        force: true,
      });
    });

    it("is read-only when an environment sets it to read, naming the environment", async () => {
      setConnectionAccess(
        { erp: "read-write" },
        '  environments: { production: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "read" } } } } } } },\n',
      );
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since \`environments.production\` of antelope.config.ts sets it to "read"`,
      );
    });

    it("is read-only when antelope.dms-database.json sets it to read, naming the file", async () => {
      setConnectionAccess({ erp: "read-write" });
      app.write(
        JSON_FILE,
        JSON.stringify({ externalConnections: { erp: { access: "read" } } }),
      );
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since antelope.dms-database.json sets it to "read"`,
      );
    });

    it("is read-only when the builder cannot read the configuration, saying so", async () => {
      app.write(
        "../antelope.config.ts",
        'import { defineConfig } from "@antelopejs/interface-core/config";\n\nconst config = defineConfig({ name: "fixture", modules: {} });\n\nexport default config;\n',
      );
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since the builder cannot read antelope.config.ts as a literal`,
      );
    });

    it("is read-only when only an environment sets it to read-write, since another launch would not", async () => {
      setConnectionAccess(
        {},
        '  environments: { development: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "read-write" } } } } } } },\n',
      );
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since no \`config.externalConnections.erp.access\``,
      );
    });

    it("is read-only when antelope.dms-database.json replaces the connection with a value that is not an object", async () => {
      setConnectionAccess({ erp: "read-write" });
      app.write(
        JSON_FILE,
        JSON.stringify({ externalConnections: { erp: "read" } }),
      );
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since antelope.dms-database.json replaces \`externalConnections.erp\``,
      );
    });

    function writeConfig(entries: string[]): void {
      app.write(
        "../antelope.config.ts",
        [
          'import { defineConfig } from "@antelopejs/interface-core/config";',
          "",
          "export default defineConfig({",
          '  name: "fixture",',
          "  modules: {",
          `    ${PROJECT_MODULE}: { source: { type: "local", path: "." } },`,
          `    "${MODULE}": { source: { type: "local", path: "modules/${MODULE}" } },`,
          ...entries.map((entry) => `    ${entry}`),
          "  },",
          "});",
          "",
        ].join("\n"),
      );
    }

    it("reads the entry keyed by the dms-database package name", async () => {
      writeConfig([
        '"@antelopejs/dms-database": { version: "0.5.0", config: { externalConnections: { erp: { access: "read-write" } } } },',
      ]);
      expectOk(await MapResources(countries(true)), "writable mapping");
    });

    it("skips a disabled dms-database entry, as core does", async () => {
      writeConfig([
        '"dms-database-next": { disabled: true, source: { type: "package", package: "@antelopejs/dms-database" }, config: { externalConnections: { erp: { access: "read-write" } } } },',
        '"dms-database": { config: { externalConnections: { erp: { access: "read" } } } },',
      ]);
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        `${READ_ONLY}, since \`config.externalConnections.erp.access\` on the dms-database entry of antelope.config.ts sets it to "read"`,
      );
    });

    it("ignores an envOverrides path that core splits inside a connection id holding a dot", async () => {
      setConnectionAccess(
        { erp: "read-write", "erp.v2": "read" },
        '  envOverrides: { ERP_ACCESS: "modules.dms-database.config.externalConnections.erp.v2.access" },\n',
      );
      process.env.ERP_ACCESS = "read-write";
      expect(
        refusalOf(
          await MapResources({ ...countries(true), connection: "erp.v2" }),
        ),
      ).to.include('connection "erp.v2" is read-only');
    });

    it("follows an envOverrides variable an environment declares", async () => {
      setConnectionAccess(
        { erp: "read-write" },
        `  environments: { default: { envOverrides: { ERP_ACCESS: "${PATH}" } } },\n`,
      );
      process.env.ERP_ACCESS = "read";
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        "the `ERP_ACCESS` variable of `envOverrides`",
      );
    });

    it("resolves the access for the launch environment alone once it is recorded", async () => {
      const production =
        '  environments: { production: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "read" } } } } } } },\n';
      setConnectionAccess({ erp: "read-write" }, production);
      try {
        recordLaunchEnvironment("default");
        expectOk(await MapResources(countries(true)), "writable mapping");
        recordLaunchEnvironment("production");
        expect(refusalOf(await MapResources(countries(true)))).to.include(
          `${READ_ONLY}, since \`environments.production\` of antelope.config.ts sets it to "read"`,
        );
      } finally {
        recordLaunchEnvironment(undefined);
      }
    });

    it("follows an envOverrides variable set in the process", async () => {
      setConnectionAccess(
        { erp: "read-write" },
        `  envOverrides: { ERP_ACCESS: "${PATH}" },\n`,
      );
      process.env.ERP_ACCESS = "read";
      expect(refusalOf(await MapResources(countries(true)))).to.include(
        "the `ERP_ACCESS` variable of `envOverrides`",
      );
      process.env.ERP_ACCESS = "read-write";
      expectOk(await MapResources(countries(true)), "writable mapping");
    });
  });

  describe("through the MCP server", () => {
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
      );
      return ToolAnswerSchema.parse(reply).result;
    }

    it("answers builder_map_resources with the refusal on a read connection, and maps once it is read-write", async () => {
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

  describe("a form over a mapped table", () => {
    let page: string;

    before(async () => {
      setConnectionAccess({ erp: "read-write" });
      expectOk(await MapResources(countries(true)), "writable mapping");
      page = await countriesPage();
      setConnectionAccess({ erp: "read" });
    });

    it("is refused when it creates or edits rows on a read connection, and added when it only shows one", async () => {
      expect(refusalOf(await form(page, "createForm", "new"))).to.include(
        `refused to add a form that creates rows of "${COUNTRIES}": ${READ_ONLY}`,
      );
      expect(refusalOf(await form(page, "editForm", "edit"))).to.include(
        `refused to add a form that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
      );
      expectOk(await form(page, "showForm", "view"), "a form that shows a row");
    });

    it("is refused, and left as it was, when a patch turns it into one that edits rows", async () => {
      expect(
        refusalOf(await ConfigureBlock(`${page}#showForm`, { mode: "edit" })),
      ).to.include(READ_ONLY);
      expect(await formMode(page, "showForm")).to.equal("view");
    });

    it("is added once the connection is read-write", async () => {
      setConnectionAccess({ erp: "read-write" });
      expectOk(await form(page, "createForm", "new"), "a form that creates");
      expectOk(
        await ConfigureBlock(`${page}#showForm`, { mode: "edit" }),
        "a form turned into one that edits",
      );
      expect(await formMode(page, "showForm")).to.equal("edit");
    });

    it("lets a patch through that leaves a writing form's mode as it was, on a read connection", async () => {
      setConnectionAccess({ erp: "read" });
      expectOk(
        await ConfigureBlock(`${page}#showForm`, { title: "Edit a country" }),
        "a title on a form that edits",
      );
      expect(await formMode(page, "showForm")).to.equal("edit");
    });

    it("refuses turning a form into one that edits rows when a project resource shares its class name", async () => {
      setConnectionAccess({ erp: "read-write" });
      expectOk(
        await CreateResource({
          name: "country",
          fields: [{ name: "label", dataType: { $dataType: "string" } }],
        }),
        "a project resource named country",
      );
      expectOk(
        await form(page, "otherForm", "view"),
        "a form that shows a row",
      );
      setConnectionAccess({ erp: "read" });
      expect(
        refusalOf(await ConfigureBlock(`${page}#otherForm`, { mode: "edit" })),
      ).to.include(
        `refused to turn a form into one that edits rows of "${COUNTRIES}": ${READ_ONLY}`,
      );
      expect(await formMode(page, "otherForm")).to.equal("view");
    });

    it("refuses a table over it while it still serves write routes on a read connection, and adds one once it is mapped read-only", async () => {
      const table = () =>
        AddBlock({
          page,
          name: "countriesTable",
          type: "TableView",
          controller: COUNTRIES,
          config: {},
        });
      setConnectionAccess({ erp: "read" });
      const message = refusalOf(await table());
      expect(message).to.include(
        `refused to add a TableView over "${COUNTRIES}", whose table still serves create, edit and delete routes`,
      );
      expect(message).to.include(READ_ONLY);

      expectOk(await MapResources(countries(false)), "read-only mapping");
      expectOk(await table(), "a table over a read-only mapping");
    });

    it("refuses routes that write on its resource while the access is read, and serves them once it is read-write", async () => {
      setConnectionAccess({ erp: "read" });
      expect(
        refusalOf(await ConfigureResource(COUNTRIES, CREATING)),
      ).to.include(
        `refused to serve the create routes on "${COUNTRIES}": ${READ_ONLY}`,
      );
      expect(moduleFile(COUNTRIES_API)).to.not.include("TableViewRoutes.New");

      setConnectionAccess({ erp: "read-write" });
      expectOk(
        await ConfigureResource(COUNTRIES, CREATING),
        "ConfigureResource",
      );
      expect(moduleFile(COUNTRIES_API)).to.include("TableViewRoutes.New");
    });
  });
});
