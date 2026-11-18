import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CategorySummary,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  editPageAsMockup,
  type Json,
  type MockupSpec,
  mockupNameSchema,
  readVersions,
  specSchema,
} from "../../../mockup";
import {
  type BlockDraft,
  stubPages,
  structureOf,
} from "../../helpers/live-page";

const BLOCKS: BlockDraft[] = [
  {
    name: "revenue",
    type: "KpiCard",
    config: { title: "Revenue", fetchUrl: "/api/books/revenue" },
  },
];

const PAGES_SECTION: CategorySummary = {
  ref: "pages",
  displayName: "$menu.section.pages",
  section: true,
};
const SALES: CategorySummary = {
  ref: "sales",
  displayName: "Sales",
  icon: "i-ph-storefront",
  section: true,
};
const CATEGORIES = [PAGES_SECTION, SALES];

/** A live page of the app in `section`, sorted by `order` in its category. */
function livePage(
  ref: string,
  section: string,
  order: number,
  version?: string,
): PageStructure {
  const structure = structureOf(ref, BLOCKS, version);
  return {
    ...structure,
    page: { ...structure.page, category: section, section, order },
  };
}

/** The app: Dashboard and Reports in Pages, Orders, Invoices and Refunds in Sales, in that order. */
const APP = [
  livePage("/dashboard", "pages", 1),
  livePage("/reports", "pages", 2),
  livePage("/orders", "sales", 1),
  livePage("/invoices", "sales", 2),
  livePage("/refunds", "sales", 3),
];

const MOCKUP = mockupNameSchema.parse("redesign");

/** The mockup a product owner started: one new page in Sales, before any conversion. */
const STARTED: MockupSpec = {
  version: 1,
  title: "Redesign",
  categories: [{ id: "sales", title: "Sales" }],
  pages: [
    { id: "forecast", title: "Forecast", category: "sales", tree: [] },
    { id: "welcome", title: "Welcome", tree: [] },
  ],
};

/** A fresh mockups directory holding the started mockup, and the conversions a test makes into it. */
function useStartedMockup() {
  const state = { dir: "" };

  beforeEach(async () => {
    state.dir = await mkdtemp(join(tmpdir(), "dms-live-page-into-"));
    await mkdir(join(state.dir, MOCKUP));
    await writeSpec(STARTED);
  });

  afterEach(() => rm(state.dir, { recursive: true, force: true }));

  const specText = () => readFile(join(state.dir, MOCKUP, "spec.json"), "utf8");
  const spec = async () => specSchema.parse(JSON.parse(await specText()));
  function writeSpec(value: Json | MockupSpec): Promise<void> {
    return writeFile(
      join(state.dir, MOCKUP, "spec.json"),
      JSON.stringify(value),
    );
  }
  return {
    get dir() {
      return state.dir;
    },
    specText,
    spec,
    writeSpec,
    into: (
      pageRef: string,
      options: { replace?: boolean } = {},
      app: PageStructure[] = APP,
    ) =>
      editPageAsMockup(
        state.dir,
        { pageRef },
        { ...options, into: MOCKUP },
        stubPages(app, undefined, CATEGORIES),
      ),
    order: async () =>
      (await spec()).pages.map((page) => `${page.category ?? "-"}:${page.id}`),
  };
}

describe("[unit] a live page converted into an existing mockup", () => {
  const t = useStartedMockup();

  it("adds the converted page to that mockup, linked, on real data, and answers where it is (fails when into makes the page's own mockup)", async () => {
    const answer = await t.into("/invoices");

    expect(answer).to.deep.equal({
      ok: true,
      outcome: "added",
      mockup: "redesign",
      page: "invoices",
      url: "/mockup?name=redesign&page=invoices",
      sketches: [],
      liveRoutes: ["api-books-revenue"],
    });
    const page = (await t.spec()).pages.find(({ id }) => id === "invoices");
    expect(page?.livePage).to.deep.equal({
      ref: "/invoices",
      version: "0123456789abcdef",
    });
    expect(page?.liveRoutes).to.deep.equal({
      "api-books-revenue": "/api/books/revenue",
    });
    expect((await t.spec()).title).to.equal("Redesign");
  });

  it("files the page under its real section, reusing the mockup's category of that section, and a Pages page under no category (fails when a second Sales category or a Pages category appears)", async () => {
    await t.into("/invoices");
    await t.into("/reports");

    const written = await t.spec();
    expect(written.categories).to.deep.equal([{ id: "sales", title: "Sales" }]);
    expect(await t.order()).to.deep.equal([
      "sales:forecast",
      "sales:invoices",
      "-:welcome",
      "-:reports",
    ]);
  });

  it("creates the category of a section the mockup does not hold yet, from the app's section", async () => {
    await t.writeSpec({ version: 1, pages: [] });

    await t.into("/orders");

    const written = await t.spec();
    expect(written.categories).to.deep.equal([
      { id: "sales", title: "Sales", icon: "i-ph-storefront" },
    ]);
    expect(written.pages.map((page) => page.category)).to.deep.equal(["sales"]);
  });

  it("puts the page among its section's converted pages in the app's menu order, whatever order they were converted in (fails when a page is only ever appended)", async () => {
    await t.into("/refunds");
    await t.into("/orders");
    await t.into("/invoices");

    expect(await t.order()).to.deep.equal([
      "sales:forecast",
      "sales:orders",
      "sales:invoices",
      "sales:refunds",
      "-:welcome",
    ]);
  });
});

describe("[unit] a live page converted into a mockup that holds it, or cannot take it", () => {
  const t = useStartedMockup();

  it("refuses a page the mockup already holds and writes nothing, unless replace converts it again in its place (fails when a second copy of the page is added)", async () => {
    await t.into("/orders");
    await t.into("/refunds");
    const before = await t.specText();

    const refused = await t.into("/orders");

    expect(refused).to.deep.include({ ok: false, error: "conflict" });
    expect(await t.specText()).to.equal(before);

    const changed = APP.map((structure) =>
      structure.page.ref === "/orders"
        ? livePage("/orders", "sales", 1, "fedcba9876543210")
        : structure,
    );
    const replaced = await t.into("/orders", { replace: true }, changed);

    expect(replaced).to.deep.include({
      ok: true,
      outcome: "replaced",
      page: "orders",
    });
    const written = await t.spec();
    expect(written.pages.filter((page) => page.id === "orders")).to.have.length(
      1,
    );
    expect(
      written.pages.find((page) => page.id === "orders")?.livePage?.version,
    ).to.equal("fedcba9876543210");
    expect(await t.order()).to.deep.equal([
      "sales:forecast",
      "sales:orders",
      "sales:refunds",
      "-:welcome",
    ]);
  });

  it("gives the page an id no page of the mockup has", async () => {
    await t.writeSpec({
      version: 1,
      pages: [{ id: "orders", title: "Orders (new)", tree: [] }],
    });

    const answer = await t.into("/orders");

    expect(answer).to.deep.include({ ok: true, page: "orders-2" });
  });

  it("writes through the mockup's history, as any edit of the viewer does (fails when the conversion skips the version write)", async () => {
    await t.into("/orders");

    const newest = (await readVersions(t.dir, MOCKUP)).at(-1);
    expect(newest?.by).to.equal("you");
    expect(JSON.stringify(newest?.spec)).to.contain('"ref":"/orders"');
  });

  it("answers not_found for a mockup that does not exist, and creates none", async () => {
    const answer = await editPageAsMockup(
      t.dir,
      { pageRef: "/orders" },
      { into: mockupNameSchema.parse("missing") },
      stubPages(APP, undefined, CATEGORIES),
    );

    expect(answer).to.deep.include({ ok: false, error: "not_found" });
    await readFile(join(t.dir, "missing", "spec.json")).then(
      () => expect.fail("a mockup was created"),
      () => undefined,
    );
  });

  it("refuses a mockup whose spec breaks the schema with invalid, writing nothing", async () => {
    const broken = JSON.stringify({ version: 1, pages: [{ id: "x" }] });
    await t.writeSpec({ version: 1, pages: [{ id: "x" }] });

    const answer = await t.into("/orders");

    expect(answer).to.deep.include({ ok: false, error: "invalid" });
    expect(await t.specText()).to.equal(broken);
  });
});
