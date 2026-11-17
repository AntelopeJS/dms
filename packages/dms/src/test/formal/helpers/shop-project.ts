import { getBuilderConfig, setBuilderConfig } from "../../../config";
import type { JsonObject } from "./json";
import { MCP_TOOLS } from "../../../mcp/tools";
import { createFixture, snapshotFixture } from "../../unit/builder/harness";
import {
  createShop,
  destroyShop,
  PAGE,
} from "../../unit/builder/helpers/block-requests";
import { readTree } from "./project-tree";

/** A block the shop's page holds, and the options it is written with. */
export interface ShopBlock {
  name: string;
  type: string;
  controller?: string;
  config: JsonObject;
}

/** The blocks the page starts with: a form, a KPI that loads, and a table over the `builder` resource. */
export const SHOP_BLOCKS: readonly ShopBlock[] = [
  {
    name: "form",
    type: "Form",
    config: {
      title: "Reconnect",
      kind: "action",
      fields: [{ id: "note", label: "Note", type: { $dataType: "string" } }],
    },
  },
  {
    name: "kpi",
    type: "KpiCard",
    config: { title: "Titles", fetchUrl: "/api/builder/list" },
  },
  { name: "rows", type: "TableView", controller: "builder", config: {} },
];

/** The shop's project: a page with {@link SHOP_BLOCKS}, restorable to that state. */
export interface ShopProject {
  /** Puts the project back as it was with its blocks written. */
  restore(): void;
  /** Every file of the project, by relative path, with its text. */
  files(): Map<string, string>;
  /** Ends the project. */
  destroy(): Promise<void>;
}

async function writeBlock(block: ShopBlock): Promise<void> {
  const tool = MCP_TOOLS.find(({ name }) => name === "builder_add_block");
  if (tool === undefined) throw new Error("no builder_add_block tool");
  const answer = await tool.call({ page: PAGE, ...block });
  if (answer.isError === true) {
    throw new Error(`${block.name}: ${answer.content[0]?.text}`);
  }
}

/** Creates the shop, writes {@link SHOP_BLOCKS} to its page and keeps that state to return to. */
export async function createShopWithBlocks(): Promise<ShopProject> {
  await createShop();
  for (const block of SHOP_BLOCKS) await writeBlock(block);
  snapshotFixture();
  let root = "";
  const restore = (): void => {
    root = createFixture({ fromSnapshot: true }).root;
    setBuilderConfig({ ...getBuilderConfig(), enabled: true });
  };
  restore();
  return {
    restore,
    files: () => readTree(root),
    destroy: destroyShop,
  };
}
