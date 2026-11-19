import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  compileSpec,
  type JsonObject,
  type MockupIssue,
  mockupNameSchema,
  parseSpec,
  TABLE_CAPTION_MESSAGE,
  writeSpec,
} from "../../../mockup";

const NAME = mockupNameSchema.parse("shop");

function table(options: JsonObject = {}): JsonObject {
  return {
    type: "TableView",
    options: {
      fetchUrl: "fixture:orders",
      columns: { name: { type: "string" } },
      ...options,
    },
  };
}

function specOf(tree: JsonObject[], page: JsonObject = {}): JsonObject {
  return {
    version: 1,
    pages: [
      {
        id: "home",
        title: "Home",
        fixtures: { orders: [{ _id: "o1", name: "A" }] },
        ...page,
        tree,
      },
    ],
  };
}

function issuesOf(spec: JsonObject): MockupIssue[] {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(NAME, read.spec).issues;
}

describe("[unit] mockup table caption", () => {
  it("reports a table without a caption, at its options, with the message that starts 'a table needs a caption: '", () => {
    const issues = issuesOf(specOf([table()]));

    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/options/caption",
        message: TABLE_CAPTION_MESSAGE,
      },
    ]);
    expect(
      TABLE_CAPTION_MESSAGE.startsWith("a table needs a caption: "),
    ).to.equal(true);
  });

  it("reports a blank caption, and a table nested in a block, but not a captioned table", () => {
    const issues = issuesOf(
      specOf([
        table({ caption: "Orders" }),
        table({ caption: "   " }),
        {
          type: "VStack",
          children: [table(), table({ caption: "Nested orders" })],
        },
      ]),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/1/options/caption",
      "/pages/0/tree/2/children/0/options/caption",
    ]);
  });

  it("accepts a table with a caption", () => {
    expect(issuesOf(specOf([table({ caption: "Orders" })]))).to.deep.equal([]);
  });

  it("leaves a page linked to a live page alone, as its tables mirror the live ones", () => {
    const linked = specOf([table()], {
      livePage: { ref: "/shop", version: "v1" },
    });

    expect(issuesOf(linked)).to.deep.equal([]);
  });

  it("refuses a write of a spec with an uncaptioned table, listing the issue the viewer shows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dms-table-caption-"));
    try {
      const refused = await writeSpec(dir, NAME, specOf([table()]), {
        by: "you",
      });
      const accepted = await writeSpec(
        dir,
        NAME,
        specOf([table({ caption: "Orders" })]),
        { by: "you" },
      );

      expect(refused.ok).to.equal(false);
      expect(refused.ok ? [] : refused.errors).to.deep.equal([
        {
          path: "/pages/0/tree/0/options/caption",
          message: TABLE_CAPTION_MESSAGE,
        },
      ]);
      expect(accepted.ok).to.equal(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
