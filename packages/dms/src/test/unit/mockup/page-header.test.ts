import Ajv2020 from "ajv/dist/2020";
import { expect } from "chai";
import {
  compileSpec,
  convertPage,
  mockupNameSchema,
  openOracle,
  parseSpec,
  planApply,
  summarize,
  type JsonObject,
  type MockupSpecPage,
} from "../../../mockup";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";
import {
  BOOK_RESOURCE,
  structureOf,
  type BlockDraft,
} from "../../helpers/live-page";

const NAME = mockupNameSchema.parse("books");
const REF = "/books";
const BLOCKS: BlockDraft[] = [
  { name: "revenue", type: "KpiCard", config: { title: "Revenue" } },
];

const HEADER: JsonObject = {
  icon: "i-ph-books",
  description: "Everything on the shelves",
  headerActions: [
    {
      label: "New book",
      icon: "i-ph-plus",
      color: "primary",
      variant: "solid",
    },
    { label: "Export" },
  ],
};

function specWith(page: JsonObject) {
  return {
    version: 1,
    pages: [{ id: "books", title: "Books", tree: [], ...page }],
  };
}

const validate = new Ajv2020({ validateFormats: false }).compile(
  MOCKUP_SPEC_SCHEMA,
);

function parsed(page: JsonObject) {
  return parseSpec(JSON.stringify(specWith(page)));
}

function planFor(icon?: string, description?: string) {
  const structure = structureOf(REF, BLOCKS);
  structure.page.icon = icon;
  structure.page.description = description;
  const oracle = openOracle(NAME, "books");
  const resources = new Map([[BOOK_RESOURCE.ref, BOOK_RESOURCE]]);
  const reconverted = convertPage(structure, "books", { oracle, resources });
  return { structure, oracle, reconverted };
}

function planEditedHeader(
  edit: (page: MockupSpecPage) => void,
  live: { icon?: string; description?: string } = {},
) {
  const { structure, oracle, reconverted } = planFor(
    live.icon,
    live.description,
  );
  const page = structuredClone(reconverted.page);
  edit(page);
  const plan = planApply(page, structure, reconverted.page, {
    pointer: "/pages/0",
    oracle,
  });
  return { ...plan, summary: summarize(plan.draft, structure) };
}

describe("[unit] mockup page header fields", () => {
  describe("the spec", () => {
    it("accepts an icon, a description and header buttons on a page", () => {
      const read = parsed(HEADER);
      expect(read.ok).to.equal(true);
      expect(validate(specWith(HEADER))).to.equal(true);
    });

    it("accepts a page with none of them, as every spec written before did", () => {
      expect(parsed({}).ok).to.equal(true);
      expect(validate(specWith({}))).to.equal(true);
    });

    it("refuses a header button that is not a PageHeaderButton's look, in the zod model and in the JSON Schema alike", () => {
      const refused: JsonObject[] = [
        { headerActions: [{ label: "Go", color: "purple" }] },
        { headerActions: [{ label: "Go", variant: "bold" }] },
        {
          headerActions: [{ label: "Go", target: { type: "page", url: "/" } }],
        },
        { headerActions: [{ icon: "i-ph-plus" }] },
        { icon: 3 },
        { description: ["x"] },
      ];
      for (const page of refused) {
        expect(parsed(page).ok, JSON.stringify(page)).to.equal(false);
        expect(validate(specWith(page)), JSON.stringify(page)).to.equal(false);
      }
    });

    it("hands the compiled page the fields it was written with, and none it was not", () => {
      const read = parsed(HEADER);
      if (!read.ok) throw new Error("the spec did not parse");
      const [page] = compileSpec(NAME, read.spec).pages;
      expect(page).to.deep.include(HEADER);

      const bare = parsed({});
      if (!bare.ok) throw new Error("the spec did not parse");
      const [plain] = compileSpec(NAME, bare.spec).pages;
      expect(plain).to.not.have.any.keys(
        "icon",
        "description",
        "headerActions",
      );
    });
  });

  describe("converting a live page", () => {
    it("fills the icon and the description from the live page", () => {
      const { reconverted } = planFor(
        "i-ph-books",
        "Everything on the shelves",
      );
      expect(reconverted.page).to.deep.include({
        icon: "i-ph-books",
        description: "Everything on the shelves",
      });
    });

    it("leaves them out when the live page has none, and never invents header buttons", () => {
      const { reconverted } = planFor();
      expect(reconverted.page).to.not.have.any.keys(
        "icon",
        "description",
        "headerActions",
      );
    });
  });

  describe("building a mockup page back into its live page", () => {
    it("writes nothing of the header when it is as the live page has it", () => {
      const plan = planEditedHeader(() => undefined, {
        icon: "i-ph-books",
        description: "Shelves",
      });
      expect(plan.draft.page).to.equal(undefined);
      expect(plan.wiring).to.deep.equal([]);
    });

    it("writes the icon and the description the mockup changed, and only those", () => {
      const plan = planEditedHeader(
        (page) => {
          page.icon = "i-ph-bookmark";
        },
        { icon: "i-ph-books", description: "Shelves" },
      );
      expect(plan.draft.page).to.deep.equal({ icon: "i-ph-bookmark" });
      expect(plan.summary).to.include({ icon: "i-ph-bookmark" });
      expect(plan.summary).to.not.have.property("description");
    });

    it("clears a field the mockup dropped", () => {
      const plan = planEditedHeader(
        (page) => {
          delete page.description;
        },
        { description: "Shelves" },
      );
      expect(plan.draft.page).to.have.property("description", undefined);
      expect(plan.summary).to.include({ description: "" });
    });

    it("leaves the header buttons to code: it lists them as wiring and writes none", () => {
      const plan = planEditedHeader((page) => {
        page.headerActions = [{ label: "New book" }];
      });
      expect(plan.draft.page).to.equal(undefined);
      expect(plan.wiring).to.deep.equal([
        { pointer: "/pages/0/headerActions", reason: "header-actions" },
      ]);
    });
  });
});
