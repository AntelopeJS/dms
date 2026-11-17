import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
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
} from "../../../implementations/dms-builder";
import {
  editPageAsMockup,
  type LivePages,
  MockupStore,
  type MockupSpec,
  mockupNameSchema,
  specSchema,
} from "../../../mockup";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 60_000;
const BUILDER: LivePages = {
  listPages: () => ListPages(),
  pageStructure: (ref) => GetPageStructure(ref),
  resourceStructure: (ref) => GetResourceStructure(ref),
};
const ORDERS = { ref: "/shop/orders", file: "orders/page.ts" };
const STOCK = { ref: "/shop/stock", file: "stock/page.ts" };
const BUILT = mockupNameSchema.parse("shop");
const HAND = mockupNameSchema.parse("hand-drawn");

let app: Fixture;
let mockups: string;
let store: MockupStore;

async function specOf(name: string) {
  return specSchema.parse(
    JSON.parse(await readFile(join(mockups, name, "spec.json"), "utf8")),
  );
}

async function writeSpec(name: string, spec: MockupSpec): Promise<void> {
  await mkdir(join(mockups, name), { recursive: true });
  await writeFile(join(mockups, name, "spec.json"), JSON.stringify(spec));
}

async function builtPages(name: string) {
  const summary = (await store.list()).find((entry) => entry.name === name);
  if (summary?.status !== "built") throw new Error(`${name} is not built`);
  return summary.builtPages.map(({ path, pageId, changed }) => ({
    path,
    pageId,
    changed,
  }));
}

function retitle(file: string, title: string): void {
  app.write(
    file,
    app.read(file).replace(/displayName: "[^"]*"/, `displayName: "${title}"`),
  );
}

/** An app with two pages of the shop, each holding one KPI. */
async function createShop(): Promise<void> {
  app = createFixture();
  expectOk(
    await CreateCategory({ name: "shop", displayName: "Shop" }),
    "CreateCategory",
  );
  for (const name of ["orders", "stock"]) {
    expectOk(
      await CreatePage({ name, displayName: name, category: "pages.shop" }),
      "CreatePage",
    );
    expectOk(
      await AddBlock({
        page: `/shop/${name}`,
        name: "kpi",
        type: "KpiCard",
        config: { title: name },
      }),
      "AddBlock",
    );
  }
}

/**
 * One built mockup of two pages, each linked to the live page it was built
 * into, and one hand-drawn built mockup linked to none.
 */
describe("[unit] mockup out of sync against the builder", () => {
  before(async function () {
    this.timeout(120_000);
    await createShop();
    mockups = await mkdtemp(join(tmpdir(), "dms-mockup-sync-"));
    store = new MockupStore(mockups, BUILDER);
  });

  beforeEach(async function () {
    this.timeout(OP_TIMEOUT);
    await rm(mockups, { recursive: true, force: true });
    await mkdir(mockups);
    retitle(ORDERS.file, "orders");
    retitle(STOCK.file, "stock");
    const pages = [];
    for (const page of [ORDERS, STOCK]) {
      const opened = await editPageAsMockup(
        mockups,
        { pageRef: page.ref },
        {},
        BUILDER,
      );
      if (!opened.ok) throw new Error(JSON.stringify(opened));
      pages.push((await specOf(opened.mockup)).pages[0]);
      await rm(join(mockups, opened.mockup), { recursive: true });
    }
    const built = {
      at: "2026-11-14T00:00:00Z",
      pages: [{ path: ORDERS.ref }, { path: STOCK.ref }],
    };
    await writeSpec(BUILT, { version: 1, built, pages });
    await writeSpec(HAND, {
      version: 1,
      built,
      pages: [{ id: "drawn", title: "Drawn", tree: [] }],
    });
  });

  after(async () => {
    store.close();
    destroyFixture();
    await rm(mockups, { recursive: true, force: true });
  });

  it("keeps a built mockup in sync when its page file is touched but its content is not (fails a check on file times)", async function () {
    this.timeout(OP_TIMEOUT);
    const later = new Date(Date.now() + 60_000);
    await utimes(join(app.root, "src", ORDERS.file), later, later);

    expect(await builtPages(BUILT)).to.deep.equal([
      { path: ORDERS.ref, pageId: "shop-orders", changed: false },
      { path: STOCK.ref, pageId: "shop-stock", changed: false },
    ]);
  });

  it("marks each edited page changed, and updating one from its page clears only that one, in the same mockup", async function () {
    this.timeout(OP_TIMEOUT);
    retitle(ORDERS.file, "Orders, edited");
    retitle(STOCK.file, "Stock, edited");
    expect((await builtPages(BUILT)).map((page) => page.changed)).to.deep.equal(
      [true, true],
    );

    const opened = await editPageAsMockup(
      mockups,
      { pageRef: ORDERS.ref },
      { mockup: BUILT },
      BUILDER,
    );
    if (!opened.ok || opened.outcome !== "reopened")
      throw new Error(JSON.stringify(opened));
    expect(opened).to.deep.include({
      mockup: BUILT,
      page: "shop-orders",
      stale: true,
    });
    const replaced = await editPageAsMockup(
      mockups,
      { pageRef: ORDERS.ref },
      { mockup: BUILT, replace: true, digest: opened.digest },
      BUILDER,
    );

    expect(replaced).to.deep.include({
      ok: true,
      outcome: "replaced",
      mockup: BUILT,
    });
    expect(await builtPages(BUILT)).to.deep.equal([
      { path: ORDERS.ref, pageId: "shop-orders", changed: false },
      { path: STOCK.ref, pageId: "shop-stock", changed: true },
    ]);
    expect(
      (await store.list()).map((entry) => entry.name).sort(),
    ).to.deep.equal([HAND, BUILT].sort());
  });

  it("never marks a built page no spec page is linked to, and refuses to update that mockup from the page (fails a fallback that makes a second mockup)", async function () {
    this.timeout(OP_TIMEOUT);
    retitle(ORDERS.file, "Orders, edited");

    expect(await builtPages(HAND)).to.deep.equal([
      { path: ORDERS.ref, pageId: undefined, changed: false },
      { path: STOCK.ref, pageId: undefined, changed: false },
    ]);
    const answer = await editPageAsMockup(
      mockups,
      { pageRef: ORDERS.ref },
      { mockup: HAND },
      BUILDER,
    );
    expect(answer).to.deep.include({ ok: false, error: "not_found" });
    expect(
      (await store.list()).map((entry) => entry.name).sort(),
    ).to.deep.equal([HAND, BUILT].sort());
  });
});
