import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  ConfigureCategory,
  ListCategories,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const REF = "pages.board";
const FILE = "board/category.ts";
const SOURCE = `import { Category, pagesCategory } from "@antelopejs/interface-dms/page";

const BOARD_PREFIX = "Shop";
const BOARD_LABEL = \`\${BOARD_PREFIX} board\`;
const icon = "i-ph-kanban";
const BOARD_RANK = 4;

export const boardCategory = Category("board", {
  displayName: BOARD_LABEL,
  icon,
  order: BOARD_RANK,
  category: pagesCategory,
});
`;

let app: Fixture;

async function categoryMeta() {
  const category = (await ListCategories()).find(({ ref }) => ref === REF);
  expect(category, REF).to.not.equal(undefined);
  return category ?? { ref: REF, displayName: "" };
}

/**
 * A category's own options written as constants: the builder reads the
 * values they hold, and writes back only an option whose value the editor
 * changed.
 */
describe("category options written as constants", () => {
  before(function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"));
    app.write(FILE, SOURCE);
    app.write("index.ts", 'import "./board/category";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("read as the values the constants hold", async () => {
    expect(await categoryMeta()).to.include({
      displayName: "Shop board",
      icon: "i-ph-kanban",
      order: 4,
      parent: "pages",
    });
  });

  it("are left as written when ConfigureCategory echoes what was read", async function () {
    this.timeout(OP_TIMEOUT);
    const { displayName, icon, order, parent } = await categoryMeta();
    expectOk(
      await ConfigureCategory(REF, { displayName, icon, order, parent }),
      "ConfigureCategory",
    );
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("refuse a parent the category does not have", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await ConfigureCategory(REF, { parent: "settings" });
    expect(result).to.deep.include({ ok: false });
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("write the option the editor changed and keep the others' constants", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureCategory(REF, { displayName: "Orders board", order: 4 }),
      "ConfigureCategory",
    );
    const written = app.read(FILE);
    expect(written).to.contain('displayName: "Orders board"');
    expect(written).to.contain("order: BOARD_RANK");
    expect(written).to.contain("  icon,\n");
    expect((await categoryMeta()).displayName).to.equal("Orders board");
  });
});
