import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  AddQuery,
  ConfigurePage,
  CreateCategory,
  CreatePage,
  CreateResource,
  DeletePage,
  GetPageStructure,
  ListCategories,
  ListPages,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const MODEL_FILE = "order/database.ts";

const BOARD_FILE = "board/page.ts";
/**
 * A page written by hand the way the playground's board is: its category is
 * declared beside it, and a page created in that category imports it from
 * here. The constants are the page's own, save the icon the category reads.
 */
const BOARD_SOURCE = `import { Placeholder } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  Category,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";

const BOARD_ICON = "i-ph-kanban";

export const boardCategory = Category("board", {
  displayName: "Board",
  icon: BOARD_ICON,
  category: pagesCategory,
});

const BOARD_PREFIX = "Shop";
const BOARD_LABEL = \`\${BOARD_PREFIX} board\`;

@RegisterPage()
export class BoardPage extends PageController(
  "overview",
  { displayName: BOARD_LABEL, category: boardCategory },
  DefaultLayout({ fullWidth: true }),
) {
  static placeholder = Placeholder({ label: BOARD_LABEL });
}
`;

let app: Fixture;

async function pageRefs(): Promise<string[]> {
  return (await ListPages()).map((page) => page.ref);
}

function managesABuilderCreatedPage(): void {
  it("is written in a folder of its own and wired into the barrel", async function () {
    this.timeout(OP_TIMEOUT);
    const created = expectOk(
      await CreatePage({
        name: "orders",
        displayName: "Orders",
        category: "pages.shop",
      }),
      "CreatePage",
    );

    expect(created.ref).to.equal("/shop/orders");
    expect(app.exists("orders/page.ts")).to.equal(true);
    expect(app.read("index.ts")).to.contain('"./orders/page"');
    expect(await pageRefs()).to.include("/shop/orders");
  });

  it("takes a new title and description in place", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigurePage("/shop/orders", {
        displayName: "All orders",
        description: "Every order placed",
      }),
      "ConfigurePage",
    );

    const { page } = expectOk(
      await GetPageStructure("/shop/orders"),
      "GetPageStructure",
    );
    expect(page.displayName).to.equal("All orders");
    expect(page.description).to.equal("Every order placed");
  });

  it("is listed with its icon, its rank and whether the menu hides it", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigurePage("/shop/orders", {
        icon: "i-ph-receipt",
        order: 3,
        hidden: true,
      }),
      "ConfigurePage",
    );

    const listed = (await ListPages()).find(
      (page) => page.ref === "/shop/orders",
    );
    expect(listed).to.include({
      icon: "i-ph-receipt",
      order: 3,
      hidden: true,
    });
  });

  it("is deleted with its folder, its barrel entry and the method behind its query", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery("/shop/orders", {
        name: "revenue",
        resource: "order",
        template: "aggregate",
        params: { op: "sum", field: "amount" },
      }),
      "AddQuery",
    );
    expect(app.read(MODEL_FILE)).to.contain("revenue(");

    expectOk(await DeletePage("/shop/orders"), "DeletePage");

    expect(app.exists("orders/page.ts")).to.equal(false);
    expect(app.exists("orders"), "the emptied folder goes too").to.equal(false);
    expect(app.read("index.ts")).to.not.contain("orders");
    expect(
      app.read(MODEL_FILE),
      "no route calls the generated method any more",
    ).to.not.contain("revenue(");
    expect(await pageRefs()).to.not.include("/shop/orders");
  });

  it("is refused when it is not there", async function () {
    this.timeout(OP_TIMEOUT);
    const result = await DeletePage("/shop/orders");

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("not_found");
    }
  });
}

function managesAPageSharingItsCategoryFile(): void {
  before(async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await CreatePage({
        name: "sales",
        displayName: "Sales",
        category: "pages.board",
      }),
      "CreatePage",
    );
  });

  it("imports the category from the page's file when created beside it", () => {
    expect(app.read("sales.ts")).to.contain(
      'import { boardCategory } from "./board/page";',
    );
  });

  it("is deleted without taking the category, or the page importing it", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await DeletePage("/board/overview"), "DeletePage");

    const board = app.read(BOARD_FILE);
    expect(board).to.not.contain("class BoardPage");
    expect(board).to.contain("export const boardCategory = Category(");
    expect(board, "the category still reads it").to.contain(
      'const BOARD_ICON = "i-ph-kanban";',
    );
    expect(app.read("sales.ts")).to.contain(
      'import { boardCategory } from "./board/page";',
    );
    expect(app.read("index.ts")).to.contain('import "./board/page";');
    expect(await pageRefs()).to.include("/board/sales");
    expect(await pageRefs()).to.not.include("/board/overview");
    expect((await ListCategories()).map((entry) => entry.ref)).to.include(
      "pages.board",
    );
  });

  it("takes what only the page used out of the file", () => {
    const board = app.read(BOARD_FILE);

    expect(board, "the constant only the page read").to.not.contain(
      "BOARD_LABEL",
    );
    expect(board, "and the one only that constant read").to.not.contain(
      "BOARD_PREFIX",
    );
    for (const name of [
      "Placeholder",
      "DefaultLayout",
      "PageController",
      "RegisterPage",
    ]) {
      expect(board, `the ${name} import`).to.not.contain(name);
    }
    expect(board).to.match(
      /import \{[^}]*\bCategory\b[^}]*\bpagesCategory\b[^}]*\} from "@antelopejs\/interface-dms\/page";/,
    );
  });

  it("moves to another category only from the version it was read at, and answers the one it wrote", async function () {
    this.timeout(OP_TIMEOUT);
    const before = expectOk(
      await GetPageStructure("/board/sales"),
      "GetPageStructure",
    );
    const refused = await ConfigurePage(
      "/board/sales",
      { category: "pages.shop" },
      { expectedVersion: "0000000000000000" },
    );
    expect(refused.ok ? "ok" : refused.error.code).to.equal("stale");

    const moved = expectOk(
      await ConfigurePage(
        "/board/sales",
        { category: "pages.shop" },
        { expectedVersion: before.version },
      ),
      "ConfigurePage",
    );
    const after = expectOk(
      await GetPageStructure(moved.ref),
      "GetPageStructure",
    );
    expect(moved.ref).to.equal("/shop/sales");
    expect(moved.version).to.equal(after.version);
    expect(moved.version).to.not.equal(before.version);
  });
}

/**
 * What the builder's pages panel relies on: a page it creates is written and
 * registered, one it edits is patched in place, and one it deletes leaves
 * nothing of itself behind — and nothing else broken.
 */
describe("the page lifecycle", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    fs.mkdirSync(path.join(app.root, "src", "board"));
    app.write(BOARD_FILE, BOARD_SOURCE);
    app.write("index.ts", 'import "./board/page";\n\nexport {};\n');
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreateResource({
        name: "order",
        displayName: "Order",
        fields: [
          {
            name: "amount",
            label: "Amount",
            dataType: { $dataType: "number" },
          },
        ],
      }),
      "CreateResource",
    );
  });

  after(() => destroyFixture());

  describe("a page the builder created", () => {
    managesABuilderCreatedPage();
  });

  describe("a page that shares its file with its category", () => {
    managesAPageSharingItsCategoryFile();
  });
});
