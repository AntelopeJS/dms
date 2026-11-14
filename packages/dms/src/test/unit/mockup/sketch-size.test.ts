import { expect } from "chai";
import {
  compileSpec,
  type Json,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import { SKETCH_MAX_SOURCE } from "../../../mockup/sketch";

const DEMO = mockupNameSchema.parse("demo");

function issuePaths(options: Json): string[] {
  const spec = {
    version: 1,
    pages: [
      {
        id: "home",
        title: "Home",
        fixtures: {},
        tree: [{ type: "sketch", options }],
      },
    ],
  };
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec).issues.map((issue) => issue.path);
}

describe("Sketch size", () => {
  it("keeps a sketch whose html and css are exactly at the size cap", () => {
    const atCap = "x".repeat(SKETCH_MAX_SOURCE);

    expect(issuePaths({ html: atCap, css: atCap })).to.deep.equal([]);
  });

  it("refuses an html or css one character over the size cap, at that field", () => {
    const overCap = "x".repeat(SKETCH_MAX_SOURCE + 1);

    expect([
      ...issuePaths({ html: overCap }),
      ...issuePaths({ html: "<p>x</p>", css: overCap }),
    ]).to.deep.equal([
      "/pages/0/tree/0/options/html",
      "/pages/0/tree/0/options/css",
    ]);
  });
});
