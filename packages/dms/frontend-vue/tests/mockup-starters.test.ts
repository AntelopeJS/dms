import { describe, expect, it } from "vitest";
import {
  catalogSections,
  newBlock,
  parseBlockCatalog,
} from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import catalog from "./fixtures/mockup-starters/catalog.json";

const NODES = "./fixtures/mockup-starters/nodes.json";

const blocks = parseBlockCatalog(catalog) ?? [];
const byType = new Map(blocks.map((block) => [block.type, block]));

function starters() {
  return Object.fromEntries(
    catalogSections(blocks, "")
      .flatMap((section) => section.blocks)
      .map((block) => [block.type, newBlock(block, byType)]),
  );
}

describe("the nodes the Add tab starts blocks as", () => {
  it("stay the nodes the backend unit test writes (fails when the starter changes and the backend fixture does not)", async () => {
    const lines = Object.entries(starters())
      .map(
        ([type, starter]) =>
          `${JSON.stringify(type)}:${JSON.stringify(starter)}`,
      )
      .join(",\n");

    await expect(`{\n${lines}\n}\n`).toMatchFileSnapshot(NODES);
  });

  it("cover every block of the catalog the backend describes (fails when the Add tab lists fewer blocks than are registered)", () => {
    expect(Object.keys(starters()).sort()).toEqual(
      blocks.map((block) => block.type).sort(),
    );
  });
});
