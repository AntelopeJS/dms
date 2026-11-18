import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import {
  buildMockupSchema,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

const CATEGORIES: JsonObject[] = [
  { id: "sales", title: "Sales", icon: "i-ph-shopping-cart" },
  { id: "admin", title: "Admin" },
];

function pageOf(id: string, category?: string): JsonObject {
  const page: JsonObject = { id, title: id, tree: [] };
  if (category !== undefined) page.category = category;
  return page;
}

function issuesOf(spec: Json): string[] {
  const read = parseSpec(JSON.stringify(spec));
  return read.ok ? [] : read.issues.map((issue) => issue.path);
}

const schemaSchema = z.object({
  properties: z.object({
    categories: z.object({
      items: z.object({ required: z.array(z.string()) }),
    }),
  }),
  $defs: z.object({
    page: z.object({
      properties: z.object({ category: z.object({ type: z.string() }) }),
    }),
  }),
});

describe("[unit] mockup sections", () => {
  it("carries the spec's categories, in order, and each page's category into the compiled state (fails when a spec with categories is refused or they are dropped)", () => {
    const read = parseSpec(
      JSON.stringify({
        version: 1,
        categories: CATEGORIES,
        pages: [
          pageOf("home"),
          pageOf("orders", "sales"),
          pageOf("users", "admin"),
        ],
      }),
    );
    if (!read.ok) throw new Error(JSON.stringify(read.issues));
    const compiled = compileSpec(DEMO, read.spec);

    expect(compiled.categories).to.deep.equal(CATEGORIES);
    expect(compiled.pages.map((page) => page.category)).to.deep.equal([
      undefined,
      "sales",
      "admin",
    ]);
  });

  it("refuses a page whose category no entry has and a category id given twice, each at its pointer", () => {
    expect(
      issuesOf({
        version: 1,
        categories: [...CATEGORIES, { id: "sales", title: "Sales again" }],
        pages: [pageOf("home", "billing")],
      }),
    ).to.deep.equal(["/categories/2/id", "/pages/0/category"]);
    expect(
      issuesOf({ version: 1, pages: [pageOf("home", "sales")] }),
    ).to.deep.equal(["/pages/0/category"]);
  });

  it("describes categories and a page's category in the JSON Schema", () => {
    const schema = schemaSchema.parse(buildMockupSchema(ListBlockTypes()));

    expect(schema.properties.categories.items.required).to.deep.equal([
      "id",
      "title",
    ]);
    expect(schema.$defs.page.properties.category.type).to.equal("string");
  });
});
