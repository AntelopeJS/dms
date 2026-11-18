import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CategorySummary,
  PageSummary,
} from "@antelopejs/interface-dms-builder";
import Ajv2020 from "ajv/dist/2020";
import { expect } from "chai";
import {
  compileSpec,
  editAppAsMockup,
  type JsonObject,
  type LivePages,
  mockupNameSchema,
  parseSpec,
  specSchema,
} from "../../../mockup";
import { stubPages, structureOf } from "../../helpers/live-page";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const validate = new Ajv2020({ validateFormats: false }).compile(
  MOCKUP_SPEC_SCHEMA,
);

const APP = mockupNameSchema.parse("app");

const CATEGORIES: CategorySummary[] = [
  { ref: "pages", displayName: "Pages", order: 1, section: true },
  {
    ref: "sales",
    displayName: "Sales",
    order: 5,
    icon: "i-ph-coins",
    section: true,
  },
  { ref: "ops", displayName: "Operations", order: 4, section: true },
  { ref: "pages.archive", displayName: "Archive", parent: "pages", order: 2 },
  { ref: "settings", displayName: "Settings", order: 3 },
];

function summary(
  ref: string,
  category: string,
  fields: Partial<PageSummary> = {},
): PageSummary {
  return {
    ref,
    id: ref.slice(1),
    displayName: `Page ${ref}`,
    category,
    filepath: `/project/src${ref}.ts`,
    ...fields,
  };
}

const PAGES: PageSummary[] = [
  summary("/invoices", "sales", { order: 2, section: "sales" }),
  summary("/quotes", "sales", {
    order: 1,
    icon: "i-ph-note",
    section: "sales",
  }),
  summary("/archive", "pages.archive", { section: "pages" }),
  summary("/home", "pages", { order: 1, section: "pages" }),
  summary("/stock", "ops", { hidden: true, section: "ops" }),
  summary("/quotes/:id", "sales", { section: "sales" }),
  summary("/settings/roles", "settings"),
];

function appPages(): LivePages {
  const stub = stubPages([
    structureOf("/invoices", [
      {
        name: "revenue",
        type: "KpiCard",
        config: { title: "Revenue", fetchUrl: "/api/invoices/revenue" },
      },
    ]),
  ]);
  return {
    ...stub,
    listPages: () => Promise.resolve(PAGES),
    listCategories: () => Promise.resolve(CATEGORIES),
  };
}

describe("[unit] mockup of the whole app", () => {
  const state = { dir: "" };

  beforeEach(async () => {
    state.dir = await mkdtemp(join(tmpdir(), "dms-from-app-"));
  });

  afterEach(() => rm(state.dir, { recursive: true, force: true }));

  async function specOf() {
    const text = await readFile(join(state.dir, "app", "spec.json"), "utf8");
    return specSchema.parse(JSON.parse(text));
  }

  it("writes the sidebar's sections as categories in order and every menu page as a live reference in menu order, a folded category's pages in its section, the converted page in its place (fails when a page moves, a section is lost, a folded category becomes a section or the converted page goes last)", async () => {
    const answer = await editAppAsMockup(
      state.dir,
      APP,
      ["/invoices"],
      appPages(),
    );
    const spec = await specOf();

    expect(answer).to.deep.include({
      ok: true,
      outcome: "created",
      mockup: "app",
      url: "/mockup?name=app&page=invoices",
      live: ["home", "archive", "stock", "quotes"],
      converted: ["invoices"],
      liveRoutes: { invoices: ["api-invoices-revenue"] },
    });
    expect(spec.categories).to.deep.equal([
      { id: "ops", title: "Operations" },
      { id: "sales", title: "Sales", icon: "i-ph-coins" },
    ]);
    expect(
      spec.pages.map(({ id, category, live, livePage, menu }) => ({
        id,
        category,
        live,
        menu,
        converted: livePage !== undefined,
      })),
    ).to.deep.equal([
      {
        id: "home",
        category: undefined,
        live: { ref: "/home" },
        menu: undefined,
        converted: false,
      },
      {
        id: "archive",
        category: undefined,
        live: { ref: "/archive" },
        menu: undefined,
        converted: false,
      },
      {
        id: "stock",
        category: "ops",
        live: { ref: "/stock" },
        menu: false,
        converted: false,
      },
      {
        id: "quotes",
        category: "sales",
        live: { ref: "/quotes" },
        menu: undefined,
        converted: false,
      },
      {
        id: "invoices",
        category: "sales",
        live: undefined,
        menu: undefined,
        converted: true,
      },
    ]);
    expect(spec.pages[3]).to.deep.equal({
      id: "quotes",
      title: "Page /quotes",
      icon: "i-ph-note",
      category: "sales",
      live: { ref: "/quotes" },
      tree: [],
    });
    expect(spec.pages[4]?.liveRoutes).to.deep.equal({
      "api-invoices-revenue": "/api/invoices/revenue",
    });
  });

  it("refuses a mockup name that exists, and a page to convert the menu does not list (fails when it writes over a mockup)", async () => {
    await editAppAsMockup(state.dir, APP, [], appPages());
    const before = await specOf();

    const again = await editAppAsMockup(state.dir, APP, [], appPages());
    const other = await editAppAsMockup(
      state.dir,
      mockupNameSchema.parse("other"),
      ["/quotes/:id"],
      appPages(),
    );

    expect(again).to.deep.include({ ok: false, error: "conflict" });
    expect(other).to.deep.include({ ok: false, error: "not_found" });
    expect(await specOf()).to.deep.equal(before);
  });
});

describe("[unit] mockup live reference page", () => {
  const LIVE: JsonObject = {
    id: "orders",
    title: "Orders",
    icon: "i-ph-package",
    live: { ref: "/orders" },
  };

  function read(page: JsonObject) {
    return parseSpec(JSON.stringify({ version: 1, pages: [page] }));
  }

  it("compiles to the live page it stands for, with no tree of its own (fails when it is drawn as blocks)", () => {
    const parsed = read(LIVE);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));

    const compiled = compileSpec(APP, parsed.spec);

    expect(compiled.issues).to.deep.equal([]);
    expect(compiled.pages).to.deep.equal([
      {
        id: "orders",
        title: "Orders",
        icon: "i-ph-package",
        options: {},
        links: [],
        tree: [],
        paths: {},
        live: { ref: "/orders" },
      },
    ]);
  });

  it("refuses a live reference holding blocks, fixtures or a livePage, in the zod schema and the JSON Schema alike (fails when a live page carries content)", () => {
    const refused: JsonObject[] = [
      { ...LIVE, tree: [{ type: "KpiCard" }] },
      { ...LIVE, fixtures: { a: 1 } },
      { ...LIVE, livePage: { ref: "/orders", version: "v1" } },
      { ...LIVE, live: { ref: "https://example.com" } },
    ];

    expect(validate({ version: 1, pages: [LIVE] })).to.equal(true);
    expect(read(LIVE).ok).to.equal(true);
    for (const page of refused) {
      expect(read(page).ok, JSON.stringify(page)).to.equal(false);
      expect(
        validate({ version: 1, pages: [page] }),
        JSON.stringify(page),
      ).to.equal(false);
    }
  });
});
