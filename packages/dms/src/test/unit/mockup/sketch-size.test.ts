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

/** `prefix`, then `<p …>x</p>` holding as many attributes as fit in the size cap, so only the attribute cap can refuse it. */
function oneTagWith(attribute: (index: number) => string, prefix = ""): string {
  const frame = prefix.length + "<p>x</p>".length;
  const attributes: string[] = [];
  let length = frame;
  for (let index = 0; ; index += 1) {
    const written = ` ${attribute(index)}`;
    if (length + written.length > SKETCH_MAX_SOURCE) break;
    attributes.push(written);
    length += written.length;
  }
  return `${prefix}<p${attributes.join("")}>x</p>`;
}

/** `head`, then `unit` repeated, then `tail`, at most the size cap long. */
function filled(head: string, unit: string, tail = ""): string {
  const room = SKETCH_MAX_SOURCE - head.length - tail.length;
  return `${head}${unit.repeat(Math.floor(room / unit.length))}${tail}`;
}

/** Half `opener` repeated, half `closer`, at most the size cap long. */
function halves(opener: string, closer: string): string {
  const half = SKETCH_MAX_SOURCE / 2;
  return `${opener.repeat(Math.floor(half / opener.length))}${closer.repeat(Math.floor(half / closer.length))}`;
}

/** Markup that hides a tag from a scan that ends comments, raw text or CDATA too early or too late. */
const SCAN_DESYNCS = [
  "<!-- x --!>",
  '<textarea><i title="</textarea>',
  '<style><i title="</style>',
  '<title><i title="</title>',
  '<xmp><i title="</xmp>',
  '<svg><![CDATA[> <i title="]]></svg>',
];

function timedCss(css: string): TimedCheck {
  const start = performance.now();
  const checked = checkSketch({ html: "<p>x</p>", css });
  return {
    ms: performance.now() - start,
    refusals: checked.ok ? [] : checked.refusals.map(({ what }) => what),
  };
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

  it("refuses a tag a comment, raw text or CDATA hides from a naive scan, within the time bound", () => {
    const timed = SCAN_DESYNCS.map((prefix) =>
      timedRefusals(oneTagWith((index) => `a${index}`, prefix)),
    );

    expect(timed.map(({ refusals }) => refusals)).to.deep.equal(
      SCAN_DESYNCS.map(() => ["a tag with more than 64 attributes"]),
    );
    expect(Math.max(...timed.map(({ ms }) => ms))).to.be.below(CHECK_BOUND_MS);
  });

  it("refuses CSS nested past the bracket bound, at the size cap and within the time bound", () => {
    const deep = [
      timedCss(filled("p{a:", "var(")),
      timedCss(filled("p{a:", "env(")),
      timedCss(halves("(", '"a"')),
      timedCss(halves("[", ")")),
      timedRefusals(`<p style="${halves("[", ")").slice(20)}">x</p>`),
    ];

    expect(deep.map(({ refusals }) => refusals.at(-1))).to.deep.equal(
      deep.map(() => "CSS nested more than 64 brackets deep"),
    );
    expect(Math.max(...deep.map(({ ms }) => ms))).to.be.below(CHECK_BOUND_MS);
  });
});

describe("Sketch check bounds on what the parser materialises", () => {
  it("refuses a css that ends its style element before parsing it, within the time bound", () => {
    const attributes = Array.from(
      { length: 95_000 },
      (_, index) => ` a${index}`,
    )
      .join("")
      .slice(0, SKETCH_MAX_SOURCE - 20);
    const timed = [
      timedCss(filled("</style>", "<div>")),
      timedCss(filled("</style><table>", "<div>")),
      timedCss(`p{}</style><b${attributes}>`),
      timedCss(`p{}</style${attributes}>`),
    ];

    expect(timed.map(({ refusals }) => refusals)).to.deep.equal(
      timed.map(() => ["markup such as </style> that ends the style element"]),
    );
    expect(Math.max(...timed.map(({ ms }) => ms))).to.be.below(CHECK_BOUND_MS);
  });

  it("bounds a style element in html by the html's own tag cap", () => {
    const timed = timedRefusals(filled("<style>p{}</style>", "<div>"));

    expect(timed.refusals).to.deep.equal([`more than 4096 tags`]);
    expect(timed.ms).to.be.below(CHECK_BOUND_MS);
  });

  it("refuses markup that makes the parser rebuild elements thousands of times, within the time bound", () => {
    const opened = (tag: string, count: number): string =>
      Array.from({ length: count }, (_, index) => `<${tag} id=${index}>`).join(
        "",
      );
    const formatting = [
      "b",
      "a",
      "i",
      "font",
      "nobr",
      "code",
      "em",
      "strong",
      "s",
      "u",
      "big",
      "small",
      "tt",
    ];
    const inputs = [
      ...formatting.map(
        (tag) => `<p>${opened(tag, 2046)}${"<p>x".repeat(2046)}`,
      ),
      `<a>${opened("b", 2040)}${"</a>x".repeat(2040)}`,
      "<a id=1><b id=2>x</a>y</b>".repeat(800),
      `<table>${opened("b", 2040)}${"<tr><td>x</td></tr>".repeat(500)}`,
      `<table>${opened("b", 2040)}${"x".repeat(2000)}`,
    ];
    const timed = inputs.map(timedRefusals);

    expect(timed.filter(({ refusals }) => refusals.length === 0)).to.deep.equal(
      [],
    );
    expect(Math.max(...timed.map(({ ms }) => ms))).to.be.below(CHECK_BOUND_MS);
  });

  it("refuses an attribute the parser would copy into every rebuilt element, never throwing, within the time bound", () => {
    const rebuilt = (attribute: string, unit: string, copies: number): string =>
      filled(`<p><b ${attribute}="`, unit, `">${"<p>x".repeat(copies)}`);
    const inputs = [
      rebuilt("style", "color:red;", 100),
      rebuilt("title", "x", 100),
      rebuilt("style", "color:red;", 10),
      rebuilt("style", "color:red;", 300),
      rebuilt("title", "x", 300),
      rebuilt("title", "x", 4094),
    ];
    const timed = inputs.map(timedRefusals);

    expect(timed.map(({ refusals }) => refusals)).to.deep.equal(
      inputs.map(() => [
        `markup that makes the parser copy more than ${2 * SKETCH_MAX_SOURCE} characters of attributes`,
      ]),
    );
    expect(Math.max(...timed.map(({ ms }) => ms))).to.be.below(CHECK_BOUND_MS);
  });

  it("refuses an <html> or <body> tag that would merge attributes into the frame's own element", () => {
    const merged = timedRefusals(`<p>x</p>${"<body b=1>".repeat(4000)}`);

    expect(merged.refusals).to.deep.equal(["an <html>, <head> or <body> tag"]);
    expect(merged.ms).to.be.below(CHECK_BOUND_MS);
  });

  it("keeps one data image as large as the size cap allows", () => {
    const image = filled('<img src="data:image/png;base64,', "A", '">');

    expect(timedRefusals(image).refusals).to.deep.equal([]);
  });
});
