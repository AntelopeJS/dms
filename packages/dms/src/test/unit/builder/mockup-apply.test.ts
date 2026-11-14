import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  AddBlock,
  CreateCategory,
  CreatePage,
  GetPageStructure,
  GetResourceStructure,
  ListPages,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import {
  applyMockupToPage,
  editPageAsMockup,
  type LivePageWriter,
  type MockupName,
  type MockupNode,
  mockupNameSchema,
  specSchema,
} from "../../../mockup";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/board";
const FILE = "board/page.ts";
const OP_TIMEOUT = 60_000;
const WIDGET = 'CustomComponent(  "SalesWidget"  )';
const LEGACY = 'CustomComponent(  "LegacyMap"  )';
/** The mockup and spec page the conversion names after the route. */
const MOCKUP = mockupNameSchema.parse("shop-board");
const SPEC_PAGE = "shop-board";

const IMPORTS = [
  'import { VStack } from "@antelopejs/interface-dms/base";',
  'import { CustomComponent } from "@antelopejs/interface-dms/base/custom";',
  "@RegisterPage(",
].join("\n");

const BUILDER: LivePageWriter = {
  listPages: () => ListPages(),
  pageStructure: (ref) => GetPageStructure(ref),
  resourceStructure: (ref) => GetResourceStructure(ref),
  setPageBlocks: (ref, draft, opts) => SetPageBlocks(ref, draft, opts),
};

let app: Fixture;
let mockups: string;

/** The page as its author wrote it: a KPI, a stack holding a KPI and a custom component, another custom component. */
function writeBoard(): void {
  const page = app
    .read(FILE)
    .replace(
      /static revenueKpi = KpiCard\([^;]*\);/,
      [
        'static revenueKpi = KpiCard({ title: "Revenue", fetchUrl: "/api/books/revenue" });',
        `static stack = VStack({}).child("orders", KpiCard({ title: "Orders" })).child("widget", ${WIDGET});`,
        `static legacy = ${LEGACY};`,
      ].join("\n  "),
    )
    .replace("@RegisterPage(", IMPORTS);
  app.write(FILE, page);
}

async function editSpec(
  edit: (spec: ReturnType<typeof specSchema.parse>) => void,
  mockup: MockupName = MOCKUP,
): Promise<void> {
  const file = join(mockups, mockup, "spec.json");
  const spec = specSchema.parse(JSON.parse(await readFile(file, "utf8")));
  edit(spec);
  await writeFile(file, JSON.stringify(spec, null, 2));
}

interface Converted {
  ref: string;
  file: string;
  mockup: MockupName;
  page: string;
}

/** A page of the shop declaring `statics` as its author wrote them, converted to a mockup page edited by `edit`. */
async function convertEdited(
  name: string,
  statics: string[],
  edit: (tree: MockupNode[]) => void,
): Promise<Converted> {
  const ref = `/shop/${name}`;
  const file = `${name}/page.ts`;
  expectOk(
    await CreatePage({ name, displayName: name, category: "pages.shop" }),
    "CreatePage",
  );
  expectOk(
    await AddBlock({ page: ref, name: "seed", type: "KpiCard", config: {} }),
    "AddBlock",
  );
  app.write(
    file,
    app
      .read(file)
      .replace(/static seed = KpiCard\([^;]*\);/, statics.join("\n  "))
      .replace("@RegisterPage(", IMPORTS),
  );
  const opened = await editPageAsMockup(mockups, { pageRef: ref }, {}, BUILDER);
  if (!opened.ok)
    throw new Error(`no mockup of ${ref}: ${JSON.stringify(opened)}`);
  const mockup = mockupNameSchema.parse(opened.mockup);
  await editSpec((spec) => edit(spec.pages[0].tree), mockup);
  return { ref, file, mockup, page: opened.page };
}

function childOf(node: MockupNode | undefined, id: string): MockupNode {
  const index = node?.children?.findIndex((child) => child.id === id) ?? -1;
  const [child] = node?.children?.splice(index, 1) ?? [];
  if (index < 0 || !child) throw new Error(`no child ${id}`);
  return child;
}

function apply(converted: Converted) {
  return applyMockupToPage(mockups, converted.mockup, converted.page, BUILDER);
}

describe("[unit] mockup apply against the builder", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreatePage({
        name: "board",
        displayName: "Board",
        category: "pages.shop",
      }),
      "CreatePage",
    );
    expectOk(
      await AddBlock({
        page: PAGE,
        name: "revenueKpi",
        type: "KpiCard",
        config: { title: "Revenue" },
      }),
      "AddBlock",
    );
    writeBoard();
    mockups = await mkdtemp(join(tmpdir(), "dms-apply-builder-"));
  });

  after(async () => {
    destroyFixture();
    await rm(mockups, { recursive: true, force: true });
  });

  it("writes an option edit and a reorder exactly there, keeping each custom component byte for byte (fails an apply that rewrites what it could keep)", async function () {
    this.timeout(OP_TIMEOUT);
    const opened = await editPageAsMockup(
      mockups,
      { pageRef: PAGE },
      {},
      BUILDER,
    );
    expect(opened).to.deep.include({
      ok: true,
      outcome: "created",
      mockup: MOCKUP,
      page: SPEC_PAGE,
    });
    await editSpec((spec) => {
      const [revenue, stack] = spec.pages[0].tree;
      revenue.options = { ...revenue.options, title: "Income" };
      stack.children?.reverse();
    });
    const before = app.read(FILE);

    const answer = await applyMockupToPage(mockups, MOCKUP, SPEC_PAGE, BUILDER);

    expect(answer).to.deep.include({
      ok: true,
      stamped: true,
      preserved: [
        `${PAGE}#stack/widget`,
        `${PAGE}#stack/orders`,
        `${PAGE}#legacy`,
      ],
      written: [`${PAGE}#revenueKpi`, `${PAGE}#stack`],
      added: [],
      removed: [],
      wiring: [],
    });
    const after = app.read(FILE);
    expect(after).to.not.equal(before);
    expect(after)
      .to.contain(WIDGET)
      .and.to.contain(`static legacy = ${LEGACY};`);
    expect(after.indexOf('"widget"')).to.be.below(after.indexOf('"orders"'));
    const structure = expectOk(await GetPageStructure(PAGE), "structure");
    expect(structure.blocks[0]?.config).to.deep.equal({
      title: "Income",
      fetchUrl: "/api/books/revenue",
    });
    expect(
      structure.blocks[1]?.children?.map((block) => block.name),
    ).to.deep.equal(["widget", "orders"]);
  });

  it("applies again to the version it recorded, writing nothing new (fails an apply that records a version the next write finds stale)", async function () {
    this.timeout(OP_TIMEOUT);
    const before = app.read(FILE);

    const answer = await applyMockupToPage(mockups, MOCKUP, SPEC_PAGE, BUILDER);

    expect(answer).to.deep.include({ ok: true, wiring: [] });
    expect(app.read(FILE)).to.equal(before);
  });

  it("writes a title the mockup changed as the page's display name (fails an apply that writes the blocks only)", async function () {
    this.timeout(OP_TIMEOUT);
    await editSpec((spec) => {
      spec.pages[0].title = "Sales board";
    });

    const answer = await applyMockupToPage(mockups, MOCKUP, SPEC_PAGE, BUILDER);

    expect(answer).to.deep.include({ ok: true, written: [], removed: [] });
    const structure = expectOk(await GetPageStructure(PAGE), "structure");
    expect(structure.page.displayName).to.equal("Sales board");
  });
});

describe("[unit] mockup apply against the builder: blocks a mockup moved, added or named", () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    mockups = await mkdtemp(join(tmpdir(), "dms-apply-names-"));
  });

  after(async () => {
    destroyFixture();
    await rm(mockups, { recursive: true, force: true });
  });

  it("keeps a custom component whose sketch the mockup moved over a removed block of its name, and removes that block (fails a matcher that lets a sketch stand for a block the page does not draw as one)", async function () {
    this.timeout(OP_TIMEOUT);
    const page = await convertEdited(
      "over",
      [
        'static orders = KpiCard({ title: "Orders" });',
        `static stack = VStack({}).child("orders", ${WIDGET}).child("note", KpiCard({ title: "Note" }));`,
      ],
      (tree) => {
        tree.splice(0, 1, childOf(tree[1], "orders"));
      },
    );

    const answer = await apply(page);

    expect(answer).to.deep.include({
      ok: true,
      removed: [`${page.ref}#orders`],
      wiring: [
        {
          pointer: "/pages/0/tree/0",
          id: "orders",
          type: "sketch",
          reason: "move",
          kept: `${page.ref}#stack/orders`,
        },
      ],
    });
    expect(app.read(page.file))
      .to.contain(WIDGET)
      .and.not.contain('KpiCard({ title: "Orders" })');
  });

  it("keeps two custom components of one name the mockup moved out of their stacks, each where it was with a move note (fails a matcher that drops a move it cannot tell apart)", async function () {
    this.timeout(OP_TIMEOUT);
    const page = await convertEdited(
      "twins",
      [
        `static s1 = VStack({}).child("widget", ${WIDGET}).child("k1", KpiCard({ title: "K1" }));`,
        `static s2 = VStack({}).child("widget", ${LEGACY}).child("k2", KpiCard({ title: "K2" }));`,
      ],
      (tree) => {
        tree.push(childOf(tree[0], "widget"), childOf(tree[1], "widget"));
      },
    );

    const answer = await apply(page);

    expect(answer).to.deep.include({ ok: true, removed: [] });
    expect(
      answer.ok && answer.wiring.map(({ reason, kept }) => ({ reason, kept })),
    ).to.deep.equal([
      { reason: "move", kept: `${page.ref}#s1/widget` },
      { reason: "move", kept: `${page.ref}#s2/widget` },
    ]);
    expect(app.read(page.file)).to.contain(WIDGET).and.contain(LEGACY);
  });

  it("applies again without renaming the blocks it added for a node with no id and for one whose id is no identifier (fails an apply that names a block it cannot pair with its node again)", async function () {
    this.timeout(OP_TIMEOUT);
    const page = await convertEdited(
      "again",
      ['static revenue = KpiCard({ title: "Revenue" });'],
      (tree) => {
        tree.push(
          { type: "KpiCard", options: { title: "Fresh" } },
          { id: "revenue-2", type: "KpiCard", options: { title: "Copy" } },
        );
      },
    );
    expect(await apply(page)).to.deep.include({
      ok: true,
      added: [`${page.ref}#kpiCard`, `${page.ref}#revenue_2`],
    });
    const before = app.read(page.file);

    const again = await apply(page);

    expect(again).to.deep.include({
      ok: true,
      added: [],
      removed: [],
      wiring: [],
    });
    expect(app.read(page.file)).to.equal(before);
  });

  it("names a block for an id the page would not list it under, so the builder lists it and the next apply finds it (fails an apply that writes a static the page reader skips or a class cannot declare)", async function () {
    this.timeout(OP_TIMEOUT);
    const page = await convertEdited(
      "hidden",
      ['static revenue = KpiCard({ title: "Revenue" });'],
      (tree) => {
        tree.push(
          { id: "_draft", type: "KpiCard", options: { title: "Draft" } },
          { id: "prototype", type: "KpiCard", options: { title: "Proto" } },
        );
      },
    );
    expect(await apply(page)).to.deep.include({
      ok: true,
      added: [`${page.ref}#block_draft`, `${page.ref}#block_prototype`],
    });
    const structure = expectOk(await GetPageStructure(page.ref), "structure");
    expect(structure.blocks.map(({ name }) => name)).to.deep.equal([
      "revenue",
      "block_draft",
      "block_prototype",
    ]);

    const again = await apply(page);

    expect(again).to.deep.include({ ok: true, added: [], removed: [] });
  });
});
