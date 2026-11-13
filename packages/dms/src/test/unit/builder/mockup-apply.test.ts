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
    .replace(
      "@RegisterPage(",
      [
        'import { VStack } from "@antelopejs/interface-dms/base";',
        'import { CustomComponent } from "@antelopejs/interface-dms/base/custom";',
        "@RegisterPage(",
      ].join("\n"),
    );
  app.write(FILE, page);
}

async function editSpec(
  edit: (spec: ReturnType<typeof specSchema.parse>) => void,
): Promise<void> {
  const file = join(mockups, MOCKUP, "spec.json");
  const spec = specSchema.parse(JSON.parse(await readFile(file, "utf8")));
  edit(spec);
  await writeFile(file, JSON.stringify(spec, null, 2));
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
});
