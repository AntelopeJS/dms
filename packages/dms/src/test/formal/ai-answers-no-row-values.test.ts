import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import fc from "fast-check";
import { MCP_TOOLS } from "../../mcp/tools";
import { redactVerifyReport } from "../../mcp/page-verify";
import { useWorkspace } from "../helpers/mockup-mcp";
import { useMockupEngine } from "./helpers/mockup-engine";
import {
  CONNECTION,
  ORDERS,
  ROW_VALUES,
} from "../unit/builder/helpers/mapped-orders";
import { MODULE, OP_TIMEOUT } from "../unit/builder/mapped-database";
import { mapOrders, type MappedProject } from "./helpers/mapped-project";
import { argumentsOf, type GeneratorOptions } from "./helpers/schema-arbitrary";
import { verifyReports } from "./helpers/verify-reports";

const SEED = 1065;
const READ_RUNS = 12;
const WRITE_RUNS = 6;
const HIDDEN_RUNS = 30;
const SESSION = "formal-row-values";
const COLUMNS = ["id", "status", "currency", "total", "placed_at"];

/** The tools whose answer is made outside the registry's `call`, and the answer function the test drives for each. */
const DRIVEN_APART: readonly string[] = ["page_verify"];

/** The tools that write and take no free-form value, where an agent has no place to send a `{ $hidden }` back. */
const TAKES_NO_FREE_FORM_VALUE: readonly string[] = [
  "builder_create_page",
  "builder_delete_page",
  "builder_move_block",
  "builder_remove_block",
  "builder_create_category",
  "builder_delete_category",
  "builder_configure_table_view",
  "builder_delete_resource",
  "builder_remove_field",
  "builder_configure_column_groups",
  "builder_remove_query",
  "builder_configure_project",
  "builder_map_resources",
  "builder_set_connection_access",
  "builder_set_theme",
  "builder_create_theme_layer",
  "mockup_resolve_annotation",
  "mockup_from_page",
  "mockup_apply_to_page",
];

let project: MappedProject;

function options(echoHidden: boolean): GeneratorOptions {
  const { ref, page } = project.orders;
  const names = ["table", "orders", "status", "currency", "total"];
  return {
    echoHidden,
    fallback: names,
    grounding: [
      [/^(ref|resource)$/, [ref]],
      [/^(pageRef|page)$/, [page, "/ops/erp-orders"]],
      [
        /path|parent|^query$/,
        [
          page,
          `${page}#table`,
          `${ref}#status`,
          `${ref}#currency`,
          `${ref}#total`,
          ref,
        ],
      ],
      [/^connection$/, [CONNECTION]],
      [/^module$/, [MODULE]],
      [/relation/, [ORDERS]],
      [/column|field|groupBy|^by$/, COLUMNS],
      [/^(name|block|slot|id)$/, names],
    ],
  };
}

/** Calls a tool as an agent would, twice for a tool that asks to see its call repeated before it writes. */
async function callTwice(
  tool: (typeof MCP_TOOLS)[number],
  args: JsonValue,
): Promise<{ text: string; isError: boolean }> {
  const first = await tool.call(args, SESSION);
  const answer =
    tool.effect === "read" ? first : await tool.call(args, SESSION);
  return {
    text: answer.content.map(({ text }) => text).join("\n"),
    isError: answer.isError === true,
  };
}

function expectNoRowValue(name: string, text: string): void {
  for (const value of ROW_VALUES) {
    expect(text, `${name} answered ${value}`).to.not.include(value);
  }
}

/** An answer a tool's own argument check gave: the arguments never reached its work. */
const SCHEMA_ISSUE =
  /^(?:\(arguments\)|[\w.[\]-]+): (?:Required|Expected|Invalid|String must|Number must|Array must|Unrecognized|must hold)/;

function reachedItsWork(text: string): boolean {
  return !text.split("\n").every((line) => SCHEMA_ISSUE.test(line));
}

describe("[formal] the MCP tools answer the shape of a connected database, never its values: for the arguments drawn from their schemas, no answer holds a canary of `erp.orders`, and every tool that writes refuses `{ $hidden }` sent back and writes nothing", function () {
  this.timeout(OP_TIMEOUT * 10);

  useWorkspace();
  const mockups = useMockupEngine();

  before(async () => {
    project = await mapOrders();
  });

  after(() => {
    project.destroy();
  });

  it("names every tool of the registry as driven here or driven apart", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    for (const name of DRIVEN_APART) expect(names).to.include(name);
  });

  for (const tool of MCP_TOOLS.filter(
    ({ name }) => !DRIVEN_APART.includes(name),
  )) {
    it(`${tool.name} answers no value of a row for the arguments it accepts`, async () => {
      let reached = 0;
      await fc.assert(
        fc.asyncProperty(
          argumentsOf(tool.inputSchema, options(false)),
          async (args) => {
            const { text } = await callTwice(tool, args);
            if (tool.effect !== "read") {
              project.restore();
              mockups.clear();
            }
            if (reachedItsWork(text)) reached += 1;
            expectNoRowValue(tool.name, text);
          },
        ),
        {
          seed: SEED,
          numRuns: tool.effect === "read" ? READ_RUNS : WRITE_RUNS,
        },
      );
      expect(
        reached,
        `no generated call of ${tool.name} passed its argument check`,
      ).to.be.greaterThan(0);
    });
  }

  it("page_verify answers a report of a page no value of a row, whatever the page quoted", () => {
    fc.assert(
      fc.property(verifyReports(ROW_VALUES), (report) => {
        expectNoRowValue(
          "page_verify",
          JSON.stringify(redactVerifyReport(report)),
        );
      }),
      { seed: SEED, numRuns: 200 },
    );
  });

  for (const tool of MCP_TOOLS.filter(({ effect }) => effect !== "read")) {
    it(`${tool.name} refuses a $hidden value sent back and writes nothing`, async () => {
      const before = project.files();
      let sent = 0;
      await fc.assert(
        fc.asyncProperty(
          argumentsOf(tool.inputSchema, options(true)),
          async (args) => {
            if (!JSON.stringify(args).includes('"$hidden"')) return;
            sent += 1;
            const { text, isError } = await callTwice(tool, args);
            expect(isError, `${tool.name} accepted $hidden: ${text}`).to.equal(
              true,
            );
            expect(project.files()).to.deep.equal(before);
            project.restore();
            mockups.clear();
          },
        ),
        { seed: SEED, numRuns: HIDDEN_RUNS },
      );
      expect(
        sent > 0,
        `${tool.name} ${sent > 0 ? "takes" : "takes no"} free-form values, which the list of tools that take none says otherwise`,
      ).to.equal(!TAKES_NO_FREE_FORM_VALUE.includes(tool.name));
    });
  }
});
