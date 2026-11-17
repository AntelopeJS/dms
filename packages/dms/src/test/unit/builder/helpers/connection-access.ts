import type {
  MapResourcesInput,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import {
  AddBlock,
  GetPageStructure,
  ListPages,
} from "../../../../implementations/dms-builder";
import {
  recordLaunchEnvironment,
  setCatalogConnectionsForTests,
  setModuleReloadForTests,
} from "../../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
  PROJECT_MODULE,
} from "../harness";
import type { McpAccess } from "../../../../mcp/access";
import { answerMcpMessage } from "../../../../mcp/protocol";
import { MCP_TOOLS } from "../../../../mcp/tools";
import { FAKE_CATALOG, MODULE } from "../mapped-database";
import { reloadedAtOnce } from "../reload-stub";

export const COUNTRIES = "erp/sales/countries";
export const COUNTRIES_API = "sales/countries/data-api.ts";
export const READ_ONLY = 'connection "erp" is read-only';
export const ACCESS_PATH =
  "modules.dms-database.config.externalConnections.erp.access";

export const RAISE_REFUSED = "an agent never raises a connection's access";

const ToolAnswerSchema = z.object({
  result: z.object({
    content: z.array(z.object({ text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

/** Calls `builder_configure_project` once, as an agent with this access. */
export function reply(access: McpAccess, args: JsonValue) {
  return answerMcpMessage(
    { access, tools: MCP_TOOLS },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "builder_configure_project", arguments: args },
    },
    "test-session",
  );
}

/** Calls the tool twice in full mode, as the repeat-confirmation gate asks; answers the second. */
export async function confirmedCall(args: JsonValue) {
  await reply("full", args);
  return ToolAnswerSchema.parse(await reply("full", args)).result;
}

/** A mapping of `sales.countries` from `erp` into the fixture's tables module. */
export function countries(writable: boolean, tableView = true) {
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
export function refusalOf(result: OpResult<unknown>): string {
  if (result.ok || result.error.code !== "invalid_config") {
    throw new Error(`expected invalid_config, got ${JSON.stringify(result)}`);
  }
  return result.error.issues.map(({ message }) => message).join("\n");
}

export interface ErpFixture {
  app(): Fixture;
  /** A file of the tables module, relative to its `src`. */
  moduleFile(relative: string): string;
  /**
   * Rewrites `antelope.config.ts` with these members of `modules` after the fixture's own, these
   * top-level members after `modules`, and these statements before the export.
   */
  writeModules(
    entries: string[],
    members?: string[],
    preamble?: string[],
  ): void;
}

/**
 * Registers the hooks of a suite over a fixture with the `erp-tables` module, the fake `erp`
 * catalog (and `erp.v2`, `other`), and no launch environment recorded.
 */
export function useErpFixture(): ErpFixture {
  let app: Fixture | undefined;
  const current = () => {
    if (!app) {
      throw new Error("the fixture is used outside its suite");
    }
    return app;
  };
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
    recordLaunchEnvironment(undefined);
    setCatalogConnectionsForTests();
    setModuleReloadForTests();
    destroyFixture();
  });
  return {
    app: current,
    moduleFile: (relative) =>
      current().read(`../modules/${MODULE}/src/${relative}`),
    writeModules: (entries, members = [], preamble = []) =>
      current().write(
        "../antelope.config.ts",
        [
          'import { defineConfig } from "@antelopejs/interface-core/config";',
          ...preamble,
          "",
          "export default defineConfig({",
          '  name: "fixture",',
          "  modules: {",
          `    ${PROJECT_MODULE}: { source: { type: "local", path: "." } },`,
          `    "${MODULE}": { source: { type: "local", path: "modules/${MODULE}" } },`,
          ...entries.map((entry) => `    ${entry}`),
          "  },",
          ...members.map((member) => `  ${member}`),
          "});",
          "",
        ].join("\n"),
      ),
  };
}

export async function countriesPage(): Promise<string> {
  const page = (await ListPages()).find(({ id }) => id === "sales-countries");
  if (!page) {
    throw new Error("the countries page was not mapped");
  }
  return page.ref;
}

export async function formMode(page: string, name: string) {
  const structure = expectOk(await GetPageStructure(page), "GetPageStructure");
  return structure.blocks.find((block) => block.name === name)?.config?.mode;
}

export function form(
  page: string,
  name: string,
  mode: "new" | "edit" | "view",
) {
  return AddBlock({
    page,
    name,
    type: "ResourceForm",
    controller: COUNTRIES,
    config: { mode },
  });
}
