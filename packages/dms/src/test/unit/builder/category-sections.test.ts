import { ImplementInterface } from "@antelopejs/interface-core";
import * as Builder from "@antelopejs/interface-dms-builder";
import type { OpResult } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import * as implementation from "../../../implementations/dms-builder";
import {
  ConfigureCategory,
  CreateCategory,
  CreatePage,
  GetPageStructure,
  ListCategories,
  ListPages,
} from "../../../implementations/dms-builder";
import { mockupTool } from "../../helpers/mockup-mcp";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const OP_TIMEOUT = 120_000;
const SESSION = "category-sections";

const IssueSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    issues: z.array(z.object({ message: z.string() })).optional(),
    detail: z.string().optional(),
  }),
});

const ListAnswerSchema = z.object({
  pages: z.array(
    z.object({ ref: z.string(), category: z.string(), section: z.string() }),
  ),
  categories: z.array(
    z.object({ ref: z.string(), section: z.literal(true).optional() }),
  ),
});

let app: Fixture;

async function categoryOf(ref: string) {
  return (await ListCategories()).find((category) => category.ref === ref);
}

async function pageOf(ref: string) {
  return (await ListPages()).find((page) => page.ref === ref);
}

function refusalOf(answer: OpResult<unknown>) {
  return IssueSchema.parse(answer).error;
}

function useFixture(this: Mocha.Suite): void {
  this.timeout(OP_TIMEOUT);

  before(() => {
    ImplementInterface(Builder, implementation);
    app = createFixture();
  });

  after(() => destroyFixture());
}

describe("[unit] builder sidebar sections: a mockup's categories are sections, so the builder writes one the sidebar draws as a header beside Pages, lists it as one and files pages in it", function () {
  useFixture.call(this);

  it("writes a section as a RootCategory beside Pages, its ref its name", async () => {
    const created = expectOk(
      await CreateCategory({
        name: "sales",
        displayName: "Sales",
        icon: "i-ph-storefront",
        order: 1.5,
        section: true,
      }),
      "CreateCategory",
    );

    expect(created).to.deep.equal({ ref: "sales" });
    const source = app.read("sales.category.ts");
    expect(source).to.include(
      'export const salesCategory = RootCategory("sales", {',
    );
    expect(source).to.include(
      'import { RootCategory } from "@antelopejs/interface-dms/page";',
    );
    expect(source).to.not.include("category:");
    expect(await categoryOf("sales")).to.deep.include({
      ref: "sales",
      displayName: "Sales",
      icon: "i-ph-storefront",
      order: 1.5,
      section: true,
    });
  });

  it("lists Pages as a section and a category under it as none", async () => {
    expectOk(
      await CreateCategory({ name: "board", displayName: "Board" }),
      "CreateCategory",
    );

    expect((await categoryOf("pages"))?.section).to.equal(true);
    expect((await categoryOf("pages.board"))?.section).to.equal(undefined);
  });

  it("creates a page in a section, which its listing and its structure report", async () => {
    expectOk(
      await CreatePage({
        name: "orders",
        displayName: "Orders",
        category: "sales",
      }),
      "CreatePage",
    );
    expectOk(
      await CreatePage({
        name: "lanes",
        displayName: "Lanes",
        category: "pages.board",
      }),
      "CreatePage",
    );

    expect(await pageOf("/sales/orders")).to.deep.include({
      category: "sales",
      section: "sales",
    });
    expect(await pageOf("/board/lanes")).to.deep.include({
      category: "pages.board",
      section: "pages",
    });
    const structure = expectOk(
      await GetPageStructure("/sales/orders"),
      "GetPageStructure",
    );
    expect(structure.page).to.deep.include({
      category: "sales",
      section: "sales",
    });
  });

  it("refuses a section under a parent, and one named after a built-in section", async () => {
    const parented = refusalOf(
      await CreateCategory({
        name: "east",
        displayName: "East",
        parent: "sales",
        section: true,
      }),
    );
    expect(parented.code).to.equal("invalid_config");
    expect(parented.issues?.[0]?.message).to.include("leave parent out");

    const builtIn = refusalOf(
      await CreateCategory({
        name: "settings",
        displayName: "Settings",
        section: true,
      }),
    );
    expect(builtIn.issues?.[0]?.message).to.equal(
      '"settings" names a built-in section of the sidebar: choose another name',
    );
  });

  it("answers builder_list_pages with the pages and the categories, each section marked", async () => {
    const answer = await mockupTool("builder_list_pages").call({}, SESSION);
    const listed = ListAnswerSchema.parse(
      JSON.parse(answer.content[0]?.text ?? "null"),
    );

    expect(
      listed.categories
        .filter((category) => category.section)
        .map(({ ref }) => ref),
    ).to.have.members(["pages", "sales"]);
    expect(
      listed.pages.find((page) => page.ref === "/sales/orders"),
    ).to.deep.include({ section: "sales" });
  });

  it("creates a section through builder_create_category", async () => {
    const answer = await mockupTool("builder_create_category").call(
      { name: "billing", displayName: "Billing", section: true },
      SESSION,
    );

    expect(answer.isError).to.not.equal(true);
    expect((await categoryOf("billing"))?.section).to.equal(true);
  });
});

describe("[unit] builder sidebar sections from categories: a category directly under Pages becomes a section and back, its pages' routes kept", function () {
  useFixture.call(this);

  before(async () => {
    expectOk(
      await CreateCategory({ name: "board", displayName: "Board" }),
      "CreateCategory",
    );
    expectOk(
      await CreatePage({
        name: "lanes",
        displayName: "Lanes",
        category: "pages.board",
      }),
      "CreatePage",
    );
  });

  it("turns a category under Pages into a section, its pages' routes kept", async () => {
    const switched = expectOk(
      await ConfigureCategory("pages.board", { section: true }),
      "ConfigureCategory",
    );

    expect(switched).to.deep.equal({ ref: "board" });
    const source = app.read("board.category.ts");
    expect(source).to.include('RootCategory("board", {');
    expect(source).to.not.match(/\bCategory\(|pagesCategory|category:/);
    expect((await categoryOf("board"))?.section).to.equal(true);
    expect(await categoryOf("pages.board")).to.equal(undefined);
    expect(await pageOf("/board/lanes")).to.deep.include({
      category: "board",
      section: "board",
    });
  });

  it("turns a section back into a category under Pages", async () => {
    const switched = expectOk(
      await ConfigureCategory("board", { section: false, icon: "i-ph-kanban" }),
      "ConfigureCategory",
    );

    expect(switched).to.deep.equal({ ref: "pages.board" });
    const source = app.read("board.category.ts");
    expect(source).to.include('Category("board", {');
    expect(source).to.include("category: pagesCategory,");
    expect(source).to.not.include("RootCategory");
    expect(await categoryOf("pages.board")).to.deep.include({
      icon: "i-ph-kanban",
    });
    expect(await pageOf("/board/lanes")).to.deep.include({
      category: "pages.board",
      section: "pages",
    });
  });

  it("refuses a section that is not true or false at the tool's input", async () => {
    const answer = await mockupTool("builder_configure_category").call(
      { ref: "pages.board", patch: { section: "yes" } },
      SESSION,
    );

    expect(answer.isError).to.equal(true);
    expect((await categoryOf("pages.board"))?.section).to.equal(undefined);
  });

  it("refuses to turn a category nested deeper than Pages into a section", async () => {
    expectOk(
      await CreateCategory({
        name: "archive",
        displayName: "Archive",
        parent: "pages.board",
      }),
      "CreateCategory",
    );

    const refused = refusalOf(
      await ConfigureCategory("pages.board.archive", { section: true }),
    );
    expect(refused.code).to.equal("unsupported");
  });
});
