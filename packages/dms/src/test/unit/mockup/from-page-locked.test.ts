import { expect } from "chai";
import { z } from "zod";
import {
  compileSpec,
  type ConvertedPage,
  convertPage,
  mockupNameSchema,
  openOracle,
  parseSpec,
} from "../../../mockup";
import {
  BOOK_RESOURCE,
  type BlockDraft,
  structureOf,
} from "../../helpers/live-page";

const NAME = mockupNameSchema.parse("books");
const REF = "/books";
const IN_CODE = "Defined by an expression in code; preserved unchanged on save";

function convert(blocks: BlockDraft[]): ConvertedPage {
  return convertPage(structureOf(REF, blocks), "books", {
    oracle: openOracle(NAME, "books"),
    resources: new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]),
  });
}

function locked(name: string, type: string, ...keys: string[]): BlockDraft {
  return {
    name,
    type,
    config: {},
    lockedOptions: Object.fromEntries(keys.map((key) => [key, IN_CODE])),
  };
}

function reasonsOf(blocks: BlockDraft[]): Record<string, string> {
  return Object.fromEntries(
    convert(blocks).sketches.map(({ path, reason }) => [path, reason]),
  );
}

describe("[unit] mockup conversion of a block with options set in code", () => {
  it("sketches a Form whose sections are set in code, naming the reason in the caption", () => {
    const converted = convert([locked("form", "Form", "sections")]);
    const [node] = converted.page.tree;

    expect(converted.sketches).to.deep.equal([
      { path: "/books#form", reason: "code-content" },
    ]);
    expect(node?.type).to.equal("sketch");
    expect(z.string().parse(node?.options?.caption)).to.equal(
      "Draws content set in code: edit it in code.",
    );
  });

  it("writes a spec the compiler admits for every block it sketched for its content", () => {
    const converted = convert([
      locked("form", "Form", "sections"),
      locked("banner", "Banner", "actions"),
    ]);
    const read = parseSpec(
      JSON.stringify({ version: 1, pages: [converted.page] }),
    );

    expect(read.ok).to.equal(true);
    if (read.ok) expect(compileSpec(NAME, read.spec).issues).to.deep.equal([]);
  });

  it("keeps a block as a block when its locked options only tune how it behaves", () => {
    const converted = convert([
      locked("feed", "ActivityFeed", "realtimeTopic", "fetchUrlMethod"),
      {
        ...locked("kpi", "KpiCard", "periodScope", "fetchUrlMethod"),
        config: { title: "Revenue" },
      },
      locked("submit", "Form", "submitUrl", "redirectOnSuccess", "slotId"),
    ]);

    expect(converted.sketches).to.deep.equal([]);
    expect(converted.page.tree.map((node) => node.type)).to.deep.equal([
      "ActivityFeed",
      "KpiCard",
      "Form",
    ]);
  });

  it("reads the block type's own schema: content held as a string, a list or chart data all count", () => {
    expect(
      reasonsOf([
        locked("title", "KpiCard", "title"),
        locked("code", "CodeBlock", "code"),
        locked("points", "ChartLine", "staticDataset"),
        locked("links", "NavCardGrid", "items"),
        locked("fields", "Form", "fields"),
      ]),
    ).to.deep.equal({
      "/books#title": "code-content",
      "/books#code": "code-content",
      "/books#points": "code-content",
      "/books#links": "code-content",
      "/books#fields": "code-content",
    });
  });

  it("sketches the block when content is locked among options that only tune it", () => {
    expect(
      reasonsOf([locked("form", "Form", "submitUrl", "sections", "slotId")]),
    ).to.deep.equal({ "/books#form": "code-content" });
  });

  it("keeps a table bound to a resource as a table: its columns come from the resource, not from its options", () => {
    const converted = convert([
      {
        ...locked("table", "TableView", "tabs", "displays", "formContainer"),
        controller: "book",
      },
    ]);

    expect(converted.sketches).to.deep.equal([]);
    expect(converted.page.tree.map((node) => node.type)).to.deep.equal([
      "TableView",
    ]);
  });

  it("leaves an option the block type does not declare as it was", () => {
    expect(
      reasonsOf([locked("grid", "NavCardGrid", "category", "undeclared")]),
    ).to.deep.equal({});
  });
});
