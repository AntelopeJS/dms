import { expect } from "chai";
import {
  AddBlock,
  CreateCategory,
  CreatePage,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const FILE = "board/page.ts";
let app: Fixture;
let base: string;
async function blocks() {
  return expectOk(await GetPageStructure(PAGE), "GetPageStructure").blocks;
}
function write(expression: string, declarations = "") {
  app.write(
    FILE,
    base
      .replace(
        /static revenueKpi = KpiCard\([^;]*\);/,
        `static revenueKpi = ${expression};`,
      )
      .replace("@RegisterPage(", `${declarations}\n@RegisterPage(`),
  );
}
function alias(name: string) {
  app.write(
    FILE,
    app.read(FILE).replace("import { KpiCard", `import { KpiCard as ${name}`),
  );
}

function readsAndEditsUnderstoodOptions(): void {
  it("reads wrappers, shorthand, imported, namespace and constant aliases by binding", async () => {
    write(
      "(Metric)({ title } as const satisfies { title: string })",
      'const title = ("Revenue" as const);',
    );
    alias("Metric");
    const [block] = await blocks();
    expect(block.type).to.equal("KpiCard");
    expect(block.editable).to.equal(true);
    expect(block.config).to.deep.equal({ title: "Revenue" });
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [{ name: block.name, type: block.type!, config: block.config }],
      }),
      "save shorthand",
    );
    expect(app.read(FILE)).to.contain("title: title");
    expect(app.read(FILE)).to.contain("(Metric)(");
    for (const callee of ["Dms.KpiCard", "LocalCard"]) {
      write(
        `${callee}({ title: "Known" })`,
        'import * as Dms from "@antelopejs/interface-dms/base"; const LocalCard = Dms.KpiCard;',
      );
      expect((await blocks())[0]).to.include({
        type: "KpiCard",
        editable: true,
      });
    }
  });

  it("does not identify a same-named local function as a DMS block", async () => {
    write(
      'KpiCard({ title: "local" })',
      "function KpiCard(options: { title: string }) { return options; }",
    );
    alias("ImportedCard");
    expect(await blocks()).to.have.length(0);
    expectOk(
      await SetPageBlocks(PAGE, { blocks: [] }),
      "leave local static alone",
    );
    expect(app.read(FILE)).to.contain('KpiCard({ title: "local" })');
  });

  it("edits understood options without accepting or changing source expressions", async () => {
    const expression =
      "( 1 + /* keep exactly\r\n  even these spaces */\r\n  2 )";
    write(
      `KpiCard({ title: "Before", staticValue: ${expression}, description: "remove" })`,
    );
    const [block] = await blocks();
    expect(block).to.include({ type: "KpiCard", editable: true });
    expect(block.config).to.deep.equal({
      title: "Before",
      description: "remove",
    });
    expect(block.lockedOptions).to.have.property("staticValue");
    const before = app.read(FILE);
    for (const config of [
      { title: "After", staticValue: 99 },
      { title: { $expr: "process.exit()" } },
    ]) {
      expect(
        (
          await SetPageBlocks(PAGE, {
            blocks: [{ name: block.name, type: "KpiCard", config }],
          })
        ).ok,
      ).to.equal(false);
      expect(app.read(FILE)).to.equal(before);
    }
    for (const config of [
      { title: "After", icon: "i-ph-coins" },
      { title: "Again" },
    ]) {
      expectOk(
        await SetPageBlocks(PAGE, {
          blocks: [{ name: block.name, type: "KpiCard", config }],
        }),
        "partial save",
      );
      expect(app.read(FILE)).to.contain(expression);
      expect((await blocks())[0].config).to.deep.equal(config);
    }
  });
}

function keepsAliasesAndChildPlacement(): void {
  it("retains an imported alias despite a different canonical-name binding", async () => {
    app.write(
      "board/custom.ts",
      "export function KpiCard(options: { title: string }) { return options; }",
    );
    for (const declaration of [
      "function KpiCard(options: { title: string }) { return options; }",
      'import { KpiCard } from "./custom";',
    ]) {
      for (const options of [
        '{ title: "Before" }',
        '{ title: "Before", staticValue: (1 + 2) }',
      ]) {
        write(`Metric(${options})`, declaration);
        alias("Metric");
        const [block] = await blocks();
        expect(block.type).to.equal("KpiCard");
        expectOk(
          await SetPageBlocks(PAGE, {
            blocks: [
              { name: block.name, type: "KpiCard", config: { title: "After" } },
            ],
          }),
          "save aliased factory",
        );
        expect(app.read(FILE)).to.contain("static revenueKpi = Metric(");
        expect(app.read(FILE)).to.contain("KpiCard as Metric");
      }
    }
  });

  it("patches a represented child by source span rather than filtered index", async () => {
    write(
      'VStack({ spacing: String(12) }).child(CHILD_ID, KpiCard({ title: "Hidden" })).child("visible", KpiCard({ title: "Visible" }))',
      'import { VStack } from "@antelopejs/interface-dms/base"; const CHILD_ID = "hidden";',
    );
    const [block] = await blocks();
    expect(block.children?.map((child) => child.name)).to.deep.equal([
      "visible",
    ]);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [
          {
            name: block.name,
            type: "VStack",
            config: {},
            children: [
              {
                name: "visible",
                type: "KpiCard",
                config: { title: "Changed" },
              },
            ],
          },
        ],
      }),
      "edit visible child",
    );
    expect(app.read(FILE)).to.contain(
      '.child(CHILD_ID, KpiCard({ title: "Hidden" }))',
    );
    expect(app.read(FILE)).to.contain(
      '.child("visible", KpiCard({ title: "Changed" }))',
    );
  });

  it("locks nested computed keys and rejects code in preserved child placement", async () => {
    write(
      'KpiCard({ title: "Safe", valueFormat: { [key()]: "USD" } })',
      'function key() { return "currency"; }',
    );
    expect((await blocks())[0].lockedOptions).to.have.property("valueFormat");
    write(
      'VStack({}).child("legacy", KpiCard(shared))',
      'import { VStack } from "@antelopejs/interface-dms/base"; const shared = { title: "Shared" };',
    );
    const before = app.read(FILE);
    const result = await SetPageBlocks(PAGE, {
      blocks: [
        {
          name: "revenueKpi",
          type: "VStack",
          children: [
            {
              name: "legacy",
              type: "KpiCard",
              preserve: true,
              meta: { colSpan: { $expr: "(() => 1)()" } },
            },
          ],
        },
      ],
    });
    expect(result.ok).to.equal(false);
    expect(app.read(FILE)).to.equal(before);
    expectOk(
      await SetPageBlocks(PAGE, {
        blocks: [
          {
            name: "revenueKpi",
            preserve: true,
            type: "VStack",
            children: [{ name: "legacy", type: "KpiCard", preserve: true }],
          },
        ],
      }),
      "preserve identified subtree",
    );
  });
}

function keepsLockedExpressionsInPlace(): void {
  it("rejects relocation instead of dropping a locked child expression", async () => {
    write('KpiCard({ title: "Before", staticValue: Math.random() })');
    const [block] = await blocks();
    const before = app.read(FILE);
    const result = await SetPageBlocks(PAGE, {
      blocks: [
        {
          name: "holder",
          type: "VStack",
          children: [
            {
              name: block.name,
              type: "KpiCard",
              config: block.config,
              lockedOptions: block.lockedOptions,
            },
          ],
        },
      ],
    });
    expect(result.ok).to.equal(false);
    expect(app.read(FILE)).to.equal(before);
  });

  it("keeps shared, spread and computed configs locked but identified", async () => {
    for (const config of [
      "shared",
      '{ ...shared, title: "override" }',
      "getOptions()",
    ]) {
      write(
        `KpiCard(${config})`,
        'const shared = { title: "Shared" }; function getOptions() { return shared; }',
      );
      const [block] = await blocks();
      expect(block).to.include({ type: "KpiCard", editable: false });
      expect(block.opaqueReason).to.be.a("string");
      expect(
        (
          await SetPageBlocks(PAGE, {
            blocks: [
              {
                name: block.name,
                type: "KpiCard",
                config: { title: "unsafe" },
              },
            ],
          })
        ).ok,
      ).to.equal(false);
      expectOk(
        await SetPageBlocks(PAGE, {
          blocks: [{ name: block.name, type: "KpiCard", preserve: true }],
        }),
        "preserve locked config",
      );
      expect(app.read(FILE)).to.contain(`KpiCard(${config})`);
    }
  });
}

describe("source-backed options", function () {
  this.timeout(60_000);
  before(async () => {
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "category",
    );
    expectOk(
      await CreatePage({
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "page",
    );
    expectOk(
      await AddBlock({
        page: PAGE,
        name: "revenueKpi",
        type: "KpiCard",
        config: { title: "Revenue" },
      }),
      "block",
    );
    base = app.read(FILE);
  });
  beforeEach(() => app.write(FILE, base));
  after(() => destroyFixture());

  readsAndEditsUnderstoodOptions();
  keepsAliasesAndChildPlacement();
  keepsLockedExpressionsInPlace();
});
