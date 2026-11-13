import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BlockTypeDescriptor,
  ListBlockTypes,
} from "@antelopejs/interface-dms/base/block-types";
import { expect } from "chai";
import { z } from "zod";
import {
  type JsonObject,
  jsonObjectSchema,
  parseMockupName,
  writeSpec,
} from "../../../mockup";
import {
  readStarterCatalog,
  readStarterNodes,
  starterViews,
  UPDATE_VARIABLE,
  writeStarterCatalog,
} from "../../helpers/mockup-starters";

const NAME = parseMockupName("starters");

function accepts(parent: BlockTypeDescriptor, child: string): boolean {
  return (
    parent.container === true &&
    (!parent.allowedChildren || parent.allowedChildren.includes(child))
  );
}

function childrenOf(node: JsonObject): JsonObject[] {
  const { children } = node;
  return Array.isArray(children)
    ? children.map((child) => jsonObjectSchema.parse(child))
    : [];
}

describe("[unit] the node the Add tab starts each block as", () => {
  const blocks = ListBlockTypes();
  const starters = readStarterNodes();
  let directory: string;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "dms-mockup-starters-"));
  });

  after(() => rm(directory, { recursive: true, force: true }));

  async function written(tree: JsonObject[], fixtures: JsonObject) {
    if (!NAME) throw new Error("starters is a valid mockup name");
    return writeSpec(directory, NAME, {
      version: 1,
      pages: [{ id: "home", title: "Home", fixtures, tree }],
    });
  }

  it("starts from the catalog the registered blocks describe (fails when a descriptor changed and the starters were not regenerated)", () => {
    const registered = starterViews(blocks);
    if (process.env[UPDATE_VARIABLE]) writeStarterCatalog(registered);

    expect(
      readStarterCatalog(),
      `a block changed: run the unit tests with ${UPDATE_VARIABLE}=1, then the frontend tests with -u`,
    ).to.deep.equal(registered);
  });

  it("has a starter for every registered block type (fails when the Add tab offers a block the fixture does not cover)", () => {
    expect(Object.keys(starters).sort()).to.deep.equal(
      blocks.map((block) => block.type).sort(),
    );
  });

  for (const block of blocks) {
    it(`writes ${block.type} alone on a page (fails when a starter lacks what the compiler asks of it)`, async () => {
      const starter = starters[block.type];

      const result = await written([starter.node], starter.fixtures);

      expect(result.ok, JSON.stringify(result)).to.equal(true);
    });

    const parents = blocks.filter((parent) => accepts(parent, block.type));
    for (const parent of parents) {
      it(`writes ${block.type} inside ${parent.type} (fails when a starter breaks a container's rules)`, async () => {
        const starter = starters[block.type];
        const holder = starters[parent.type];
        const siblings = childrenOf(holder.node);
        const taken = new Set(siblings.map((sibling) => sibling.id));
        const id = z.string().parse(starter.node.id);
        const child = taken.has(id)
          ? { ...starter.node, id: `${id}-added` }
          : starter.node;

        const result = await written(
          [{ ...holder.node, children: [...siblings, child] }],
          { ...holder.fixtures, ...starter.fixtures },
        );

        expect(result.ok, JSON.stringify(result)).to.equal(true);
      });
    }
  }
});
