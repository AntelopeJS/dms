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
const CAPTION = "Set in code: edit it in code.";

function convert(blocks: BlockDraft[]): ConvertedPage {
  return convertPage(structureOf(REF, blocks), "books", {
    oracle: openOracle(NAME, "books"),
    resources: new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]),
  });
}

function locked(
  name: string,
  type: string,
  config: BlockDraft["config"],
  ...keys: string[]
): BlockDraft {
  return {
    name,
    type,
    config,
    lockedOptions: Object.fromEntries(keys.map((key) => [key, IN_CODE])),
  };
}

function reasonsOf(blocks: BlockDraft[]): Record<string, string> {
  return Object.fromEntries(
    convert(blocks).sketches.map(({ path, reason }) => [path, reason]),
  );
}

describe("[unit] mockup conversion of a block with options set in code", () => {
  it("sketches a KpiCard whose staticValue is set in code, not draws it empty (fails a predicate that reads only `content` groups and structured arrays)", () => {
    expect(
      reasonsOf([
        locked("kpi", "KpiCard", { title: "Revenue" }, "staticValue"),
      ]),
    ).to.deep.equal({ "/books#kpi": "set-in-code" });
  });

  it("sketches a Meter whose value is set in code (fails a predicate that files a number under tuning)", () => {
    expect(
      reasonsOf([locked("meter", "Meter", { label: "Disk" }, "value")]),
    ).to.deep.equal({ "/books#meter": "set-in-code" });
  });

  it("sketches a ChartCard whose chart is set in code as set-in-code, not as invalid options, and says so in the caption (fails a converter that lets the compiler refuse the empty card)", () => {
    const converted = convert([
      locked("card", "ChartCard", { title: "Sales" }, "chart"),
    ]);
    const [node] = converted.page.tree;

    expect(converted.sketches).to.deep.equal([
      { path: "/books#card", reason: "set-in-code" },
    ]);
    expect(node?.type).to.equal("sketch");
    expect(z.string().parse(node?.options?.caption)).to.equal(CAPTION);
  });

  it("sketches a chart whose rawCss is set in code: code the mockup cannot express (fails a predicate that reads an array of key/value objects as styling)", () => {
    expect(
      reasonsOf([
        locked("line", "ChartLine", { title: "Sales" }, "rawCss"),
        locked("bar", "ChartBar", { title: "Sales" }, "rawOptions"),
      ]),
    ).to.deep.equal({
      "/books#line": "set-in-code",
      "/books#bar": "set-in-code",
    });
  });

  it("sketches a Form whose sections are set in code (fails a converter that ignores locked options)", () => {
    expect(
      reasonsOf([locked("form", "Form", { title: "Edit" }, "sections")]),
    ).to.deep.equal({ "/books#form": "set-in-code" });
  });

  it("keeps a block as a block, drawn with its defaults, when every locked option is a style: appearance or layout (fails a converter that sketches every locked block)", () => {
    const converted = convert([
      locked("line", "ChartLine", { title: "Sales" }, "color"),
      locked("bar", "ChartBar", { title: "Sales" }, "orientation", "stacked"),
    ]);

    expect(converted.sketches).to.deep.equal([]);
    expect(
      converted.page.tree.map(({ type, options }) => [type, options]),
    ).to.deep.equal([
      ["ChartLine", { title: "Sales" }],
      ["ChartBar", { title: "Sales" }],
    ]);
  });

  it("sketches the block when a style is locked among options that are not (fails a converter that tests only the first locked option)", () => {
    expect(
      reasonsOf([
        locked("line", "ChartLine", { title: "Sales" }, "color", "rawCss"),
      ]),
    ).to.deep.equal({ "/books#line": "set-in-code" });
  });

  it("sketches a block whose locked option its type does not declare (fails a converter that treats an unknown key as no content)", () => {
    expect(
      reasonsOf([
        locked("grid", "NavCardGrid", { categoryId: "x" }, "undeclared"),
      ]),
    ).to.deep.equal({ "/books#grid": "set-in-code" });
  });

  it("keeps a table bound to a resource as a table whatever its locked options: its columns come from the resource (fails a converter that applies the rule before the table route)", () => {
    const converted = convert([
      {
        ...locked(
          "table",
          "TableView",
          {},
          "tabs",
          "displays",
          "formContainer",
        ),
        controller: "book",
      },
    ]);

    expect(converted.sketches).to.deep.equal([]);
    expect(converted.page.tree.map((node) => node.type)).to.deep.equal([
      "TableView",
    ]);
  });

  it("writes a spec the compiler admits for every block it sketched as set in code", () => {
    const converted = convert([
      locked("kpi", "KpiCard", { title: "Revenue" }, "staticValue"),
      locked("card", "ChartCard", { title: "Sales" }, "chart"),
      locked("form", "Form", { title: "Edit" }, "sections"),
    ]);
    const read = parseSpec(
      JSON.stringify({ version: 1, pages: [converted.page] }),
    );

    expect(read.ok).to.equal(true);
    if (read.ok) expect(compileSpec(NAME, read.spec).issues).to.deep.equal([]);
  });
});
