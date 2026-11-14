import { expect } from "chai";
import {
  compileSpec,
  type Json,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import { checkSketch, SKETCH_MAX_SOURCE } from "../../../mockup/sketch";

/** What one check may take on the slowest input the caps admit; parse5 took 13 s on the attribute input before the per-tag cap. */
const CHECK_BOUND_MS = 2_000;
const OVERSIZED_SOURCE = 20 * 1024 * 1024;

/** `<p …>x</p>` holding as many attributes as fit in the size cap, so only the attribute cap can refuse it. */
function oneTagWith(attribute: (index: number) => string): string {
  const frame = "<p>x</p>".length;
  const attributes: string[] = [];
  let length = frame;
  for (let index = 0; ; index += 1) {
    const written = ` ${attribute(index)}`;
    if (length + written.length > SKETCH_MAX_SOURCE) break;
    attributes.push(written);
    length += written.length;
  }
  return `<p${attributes.join("")}>x</p>`;
}

/** How long one check took, and what it refused. */
interface TimedCheck {
  ms: number;
  refusals: string[];
}

function timedRefusals(html: string): TimedCheck {
  const start = performance.now();
  const checked = checkSketch({ html });
  return {
    ms: performance.now() - start,
    refusals: checked.ok ? [] : checked.refusals.map(({ what }) => what),
  };
}

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
    const html = "x".repeat(SKETCH_MAX_SOURCE);
    const css = `/*${"x".repeat(SKETCH_MAX_SOURCE - 4)}*/`;

    expect(issuePaths({ html, css })).to.deep.equal([]);
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

  it("refuses one tag holding tens of thousands of attributes, within the time bound", () => {
    const named = timedRefusals(oneTagWith((index) => `a${index}`));
    const data = timedRefusals(oneTagWith((index) => `data-${index}`));

    expect([named.refusals, data.refusals]).to.deep.equal([
      ["a tag with more than 64 attributes"],
      ["a tag with more than 64 attributes"],
    ]);
    expect(Math.max(named.ms, data.ms)).to.be.below(CHECK_BOUND_MS);
  });

  it("refuses an html past the size cap when checkSketch is called directly, within the time bound", () => {
    const oversized = timedRefusals("<p>x</p>".repeat(OVERSIZED_SOURCE / 8));

    expect(oversized.refusals).to.deep.equal([
      `more than ${SKETCH_MAX_SOURCE} characters`,
    ]);
    expect(oversized.ms).to.be.below(CHECK_BOUND_MS);
  });
});
