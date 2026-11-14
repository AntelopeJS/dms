import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  ConfigurePage,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const PAGE = "/board/overview";
const ARCHIVE = "/board/archive";
const FILE = "board/page.ts";
const SOURCE = `import { Placeholder } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  Category,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

export const boardCategory = Category("board", {
  displayName: "Board",
  category: pagesCategory,
});

const BOARD_PREFIX = "Shop";
const BOARD_LABEL = \`\${BOARD_PREFIX} board\`;
const icon = "i-ph-kanban";
const BOARD_RANK = 4;
const BOARD_HIDDEN = true;
const BOARD_NOTES = "Every board";

@RegisterPage()
export class BoardPage extends PageController(
  "overview",
  {
    displayName: BOARD_LABEL,
    icon,
    order: BOARD_RANK,
    hidden: BOARD_HIDDEN,
    description: BOARD_NOTES,
    category: boardCategory,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static placeholder = Placeholder({ label: "Board" });
}

function labelFor(name: string): string {
  return name.toUpperCase();
}

function iconFor(name: string): string {
  return \`i-ph-\${name}\`;
}

@RegisterPage()
export class ArchivePage extends PageController(
  "archive",
  {
    displayName: labelFor("archive"),
    icon: iconFor("archive"),
    category: boardCategory,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static placeholder = Placeholder({ label: "Archive" });
}
`;

let app: Fixture;

async function pageMeta(page = PAGE) {
  return expectOk(await GetPageStructure(page), "GetPageStructure").page;
}

async function echoArchiveWithNullIcon() {
  const { displayName, icon, category } = await pageMeta(ARCHIVE);
  expect(icon).to.equal(undefined);
  expectOk(
    await ConfigurePage(ARCHIVE, {
      displayName,
      category,
      ...Object.fromEntries([["icon", null]]),
    }),
    "ConfigurePage",
  );
}

/**
 * The page's own options written as constants: the builder reads the values
 * they hold, and writes back only an option whose value the editor changed.
 */
describe("page options written as constants", () => {
  before(function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"));
    app.write(FILE, SOURCE);
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
  });

  after(() => destroyFixture());

  it("read as the values the constants hold", async () => {
    expect(await pageMeta()).to.include({
      displayName: "Shop board",
      icon: "i-ph-kanban",
      order: 4,
      hidden: true,
      description: "Every board",
    });
  });

  it("are left as written when ConfigurePage echoes what was read", async function () {
    this.timeout(OP_TIMEOUT);
    const { displayName, icon, order, hidden, description, category } =
      await pageMeta();
    expectOk(
      await ConfigurePage(PAGE, {
        displayName,
        icon,
        order,
        hidden,
        description,
        category,
      }),
      "ConfigurePage",
    );
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("are left as written when a draft save echoes what was read", async function () {
    this.timeout(OP_TIMEOUT);
    const { displayName, icon, order, hidden, description } = await pageMeta();
    const { blocks } = expectOk(
      await GetPageStructure(PAGE),
      "GetPageStructure",
    );
    expectOk(
      await SetPageBlocks(PAGE, {
        page: { displayName, icon, order, hidden, description },
        blocks: blocks.map((block) => ({
          name: block.name,
          type: block.type ?? undefined,
          config: block.config,
        })),
      }),
      "SetPageBlocks",
    );
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("are left as written when ConfigurePage echoes the id a name written as code reads as", async function () {
    this.timeout(OP_TIMEOUT);
    const { displayName, category } = await pageMeta(ARCHIVE);
    expect(displayName).to.equal("archive");
    expectOk(
      await ConfigurePage(ARCHIVE, { displayName, category }),
      "ConfigurePage",
    );
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("are left as written when ConfigurePage echoes an icon written as code as null", async function () {
    this.timeout(OP_TIMEOUT);
    await echoArchiveWithNullIcon();
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("are left as written when a draft save echoes the id a name written as code reads as", async function () {
    this.timeout(OP_TIMEOUT);
    const { page, blocks } = expectOk(
      await GetPageStructure(ARCHIVE),
      "GetPageStructure",
    );
    expectOk(
      await SetPageBlocks(ARCHIVE, {
        page: { displayName: page.displayName },
        blocks: blocks.map((block) => ({
          name: block.name,
          type: block.type ?? undefined,
          config: block.config,
        })),
      }),
      "SetPageBlocks",
    );
    expect(app.read(FILE)).to.equal(SOURCE);
  });

  it("write the option the editor changed and keep the others' constants", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigurePage(PAGE, { displayName: "Orders board", order: 4 }),
      "ConfigurePage",
    );
    const written = app.read(FILE);
    expect(written).to.contain('displayName: "Orders board"');
    expect(written).to.contain("order: BOARD_RANK");
    expect(written).to.contain("    icon,\n");
    expect((await pageMeta()).displayName).to.equal("Orders board");
  });

  it("write a changed shorthand option once, and take out a cleared one", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigurePage(PAGE, {
        icon: "i-ph-receipt",
        description: undefined,
      }),
      "ConfigurePage",
    );
    const written = app.read(FILE);
    expect(written).to.contain('icon: "i-ph-receipt"');
    expect(written, "the shorthand is replaced").to.not.contain("    icon,\n");
    expect(written).to.not.contain("description:");
    const meta = await pageMeta();
    expect(meta.icon).to.equal("i-ph-receipt");
    expect(meta.description).to.equal(undefined);
  });
});
