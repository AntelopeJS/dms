import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import fc from "fast-check";
import type { JsonObject } from "./helpers/json";
import { MCP_TOOLS } from "../../mcp/tools";
import { useWorkspace } from "../helpers/mockup-mcp";
import { OP_TIMEOUT, PAGE } from "../unit/builder/helpers/block-requests";
import { editNodeOptions } from "./helpers/mockup-spec";
import { type MockupEngine, useMockupEngine } from "./helpers/mockup-engine";
import {
  createShopWithBlocks,
  SHOP_BLOCKS,
  type ShopBlock,
  type ShopProject,
} from "./helpers/shop-project";
import { badOptions, goodOptions } from "./helpers/request-targets";
import { z } from "zod";

const SEED = 1074;
const RUNS = 12;

/**
 * Every tool that writes, and whether the block options an agent sends reach the page's source.
 * A tool that reaches them is driven below with options aimed outside the data API; a tool that
 * does not is named so that a new tool is sorted into one of the two.
 */
const BLOCK_WRITERS = [
  "builder_add_block",
  "builder_compose_page",
  "builder_configure_block",
  "mockup_apply_to_page",
] as const;

const NO_BLOCK_OPTIONS = [
  "builder_create_page",
  "builder_configure_page",
  "builder_delete_page",
  "builder_move_block",
  "builder_remove_block",
  "builder_create_category",
  "builder_configure_category",
  "builder_delete_category",
  "builder_configure_table_view",
  "builder_create_resource",
  "builder_delete_resource",
  "builder_add_field",
  "builder_configure_field",
  "builder_configure_column_groups",
  "builder_remove_field",
  "builder_add_query",
  "builder_configure_query",
  "builder_remove_query",
  "builder_configure_project",
  "builder_map_resources",
  "builder_set_connection_access",
  "builder_set_theme",
  "builder_create_theme_layer",
  "mockup_resolve_annotation",
  "mockup_write_spec",
  "mockup_patch_spec",
  "mockup_from_page",
] as const;

type BlockWriter = (typeof BLOCK_WRITERS)[number];

const FromPageSchema = z.object({ mockup: z.string(), page: z.string() });

let project: ShopProject;
let mockups: MockupEngine;

function toolOf(name: string) {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`MCP_TOOLS serves no tool ${name}`);
  return tool;
}

async function callTool(
  name: string,
  args: JsonValue,
): Promise<{ text: string; isError: boolean }> {
  const answer = await toolOf(name).call(args, "formal-request-targets");
  return {
    text: answer.content.map(({ text }) => text).join("\n"),
    isError: answer.isError === true,
  };
}

/** The block `base` as an `Extra` block of its type, written beside the ones the page has. */
function added(base: ShopBlock, options: JsonObject): JsonObject {
  const block: JsonObject = {
    name: `${base.name}Extra`,
    type: base.type,
    config: { ...base.config, ...options },
  };
  if (base.controller !== undefined) block.controller = base.controller;
  return block;
}

/** Writes the mockup of the page, applies the options to its node of `base`, and applies the mockup back. */
async function applyThroughMockup(
  base: ShopBlock,
  options: JsonObject,
): Promise<{ text: string; isError: boolean }> {
  const converted = await callTool("mockup_from_page", { pageRef: PAGE });
  if (converted.isError) return converted;
  const { mockup, page } = FromPageSchema.parse(JSON.parse(converted.text));
  try {
    editNodeOptions(mockup, base.name, options);
    return await callTool("mockup_apply_to_page", { mockup, page });
  } finally {
    mockups.clear();
  }
}

/** How each tool that reaches block options is asked to write `options` on a block of the shop's page. */
const WRITERS: Record<
  BlockWriter,
  (
    base: ShopBlock,
    options: JsonObject,
  ) => Promise<{ text: string; isError: boolean }>
> = {
  builder_add_block: (base, options) =>
    callTool("builder_add_block", { page: PAGE, ...added(base, options) }),
  builder_compose_page: (base, options) =>
    callTool("builder_compose_page", {
      pageRef: PAGE,
      blocks: [added(base, options)],
    }),
  builder_configure_block: (base, options) =>
    callTool("builder_configure_block", {
      path: `${PAGE}#${base.name}`,
      patch: options,
    }),
  mockup_apply_to_page: applyThroughMockup,
};

function unchanged(before: Map<string, string>): void {
  expect(project.files()).to.deep.equal(before);
}

/**
 * A block an agent writes runs in the owner's browser with the owner's session, so one that
 * posts, loads or links outside its page's data API acts for the owner. Every tool that persists
 * block options refuses the options the generator aims outside the data API, with the page's files
 * unchanged, and accepts the ones aimed inside it.
 */
describe("[formal] every tool that writes blocks judges where their requests go", function () {
  this.timeout(OP_TIMEOUT * 6);

  useWorkspace();
  mockups = useMockupEngine();

  before(async () => {
    project = await createShopWithBlocks();
  });

  beforeEach(() => {
    project.restore();
  });

  after(async () => {
    await project.destroy();
  });

  it("sorts every tool that writes into one that reaches block options or one that does not", () => {
    const sorted = [...BLOCK_WRITERS, ...NO_BLOCK_OPTIONS].sort();
    const writing = MCP_TOOLS.filter(({ effect }) => effect !== "read")
      .map(({ name }) => name)
      .sort();
    expect(sorted).to.deep.equal(writing);
  });

  it("carries a Form through a mockup as a custom sketch, so mockup_apply_to_page keeps its options as the page has them", async () => {
    const [form] = SHOP_BLOCKS;
    const { text, isError } = await applyThroughMockup(form, {
      submitUrl: "/api/builder/new",
    });
    expect(isError, text).to.equal(false);
    expect(text).to.include('"reason":"custom-component"');
    expect(text).to.include('"written":[]');
    project.restore();
  });

  for (const writer of BLOCK_WRITERS) {
    for (const base of SHOP_BLOCKS.filter(
      ({ type }) => writer !== "mockup_apply_to_page" || type !== "Form",
    )) {
      it(`${writer} on a ${base.type} writes options aimed inside the data API`, async () => {
        for (const options of goodOptions(base)) {
          const before = project.files();
          const { text, isError } = await WRITERS[writer](base, options);
          expect(isError, text).to.equal(false);
          expect(project.files()).to.not.deep.equal(before);
          project.restore();
        }
      });

      it(`${writer} on a ${base.type} refuses options aimed outside it and writes nothing`, async () => {
        const before = project.files();
        await fc.assert(
          fc.asyncProperty(badOptions(base), async (options) => {
            const { text, isError } = await WRITERS[writer](base, options);
            expect(
              isError,
              `${writer} wrote ${JSON.stringify(options)}: ${text}`,
            ).to.equal(true);
            unchanged(before);
            project.restore();
          }),
          { seed: SEED, numRuns: RUNS },
        );
      });
    }
  }
});
