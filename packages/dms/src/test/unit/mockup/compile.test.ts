import { expect } from "chai";
import {
  ListBlockTypes,
  RegisterBlockType,
} from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import {
  buildMockupSchema,
  type CompiledSpec,
  compileSpec,
  type Json,
  MAX_JSON_DEPTH,
  mockupNameSchema,
  MockupStore,
  parseSpec,
} from "../../../mockup";
import {
  docsExamplesSpecTexts,
  EXAMPLE_MOCKUP,
  MOCKUP_DATA_DIR,
} from "../../helpers/mockup";

const DEMO = mockupNameSchema.parse("demo");

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function onePage(tree: Json[], fixtures: Json = {}): Json {
  return { version: 1, pages: [{ id: "home", title: "Home", fixtures, tree }] };
}

describe("[unit] mockup compiler", () => {
  it("compiles the shipped example spec with no issue", async () => {
    const store = new MockupStore(MOCKUP_DATA_DIR);
    const state = await store.state(mockupNameSchema.parse(EXAMPLE_MOCKUP));

    expect(state?.issues).to.deep.equal([]);
    expect(state?.pages.map((page) => page.id)).to.deep.equal([
      "orders",
      "customer",
    ]);
    expect(state?.pages[0].paths["block-1.chart"]).to.equal(
      "/pages/0/tree/1/children/0",
    );
    const table = z
      .object({ source: z.object({ fetchUrl: z.string() }) })
      .parse(state?.pages[0].tree[2].options);
    expect(table.source.fetchUrl).to.equal(
      "/api/mockup/mockup-example/pages/orders/fixtures/orders/rows",
    );
  });

  it("compiles every docs example of a non-controller block with no option issue", () => {
    const specs = docsExamplesSpecTexts().map((text) => {
      const read = parseSpec(text);
      if (!read.ok) throw new Error(JSON.stringify(read.issues));
      return read.spec;
    });

    const byExample = specs.flatMap((spec) =>
      compileSpec(DEMO, spec).issues.map(({ path, message }) => {
        const page = Number(/^\/pages\/(\d+)/.exec(path)?.[1]);
        return `${spec.pages[page]?.title}: ${path} ${message}`;
      }),
    );
    const examples = specs.flatMap((spec) => spec.pages).length;

    expect(byExample).to.deep.equal([]);
    expect(examples).to.be.greaterThan(50);
  });

  it("reports a bad option at its exact pointer and still emits the node", () => {
    const kpi = { title: "Revenue", valueFormat: "bogus" };
    const { issues, pages } = compile(
      onePage([
        {
          type: "HStack",
          children: [
            { id: "a", type: "KpiCard", options: { title: "Fine" } },
            { id: "b", type: "KpiCard", options: kpi },
          ],
        },
      ]),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/0/children/1/options/valueFormat",
    ]);
    expect(pages[0].tree[0].children?.[1].options).to.deep.equal(kpi);
  });

  it("reports a child its parent block does not accept, at the child", () => {
    const card = { type: "KpiCard", options: { title: "Revenue" } };
    const { issues, pages } = compile(
      onePage([
        {
          type: "Grid",
          children: [card, { type: "GridRow", children: [card] }],
        },
        { type: "KpiCard", options: { title: "Orders" }, children: [card] },
        {
          type: "ChartCard",
          options: { title: "Sales" },
          children: [{ id: "chart", type: "ChartArea" }],
        },
      ]),
    );

    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/children/0",
        message: "Grid accepts only GridRow as children",
      },
      {
        path: "/pages/0/tree/1/children/0",
        message: "KpiCard takes no children",
      },
    ]);
    expect(pages[0].tree[0].children).to.have.length(2);
  });

  it("reports an unknown block type and still emits it as written", () => {
    const node = { type: "NoSuchBlock", options: { title: "x" } };
    const { issues, pages } = compile(onePage([node]));

    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/type",
        message: 'no block type is registered as "NoSuchBlock"',
      },
    ]);
    expect(pages[0].tree).to.deep.equal([node]);
  });

  it("rewrites fixture references at any depth and reports a missing key", () => {
    const { issues, pages } = compile(
      onePage(
        [
          {
            type: "ChartCard",
            options: { title: "Sales", fetchUrl: "fixture:sales" },
            children: [{ id: "chart", type: "ChartLine" }],
          },
          {
            type: "Banner",
            options: {
              tone: "info",
              actions: [{ label: "Open", to: "fixture:nowhere" }],
            },
          },
        ],
        { sales: { value: 1, series: [] } },
      ),
    );

    expect(pages[0].tree[0].options?.fetchUrl).to.equal(
      "/api/mockup/demo/pages/home/fixtures/sales",
    );
    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/1/options/actions/0/to",
        message: 'the page has no fixture named "nowhere"',
      },
    ]);
  });

  it("refuses a sketch holding a script or a remote url()", () => {
    const { issues, pages } = compile(
      onePage([
        {
          type: "sketch",
          options: {
            html: "<div>ok</div><script>alert(1)</script>",
            css: "div{background:url(https://example.com/x.png)}",
          },
        },
        { type: "sketch", options: { html: "<p>fine</p>", height: 120 } },
      ]),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/0/options/html",
      "/pages/0/tree/0/options/css",
    ]);
    expect(pages[0].tree[0].options).to.deep.equal({ html: "", height: 320 });
    expect(pages[0].tree[1].options).to.deep.equal({
      html: "<p>fine</p>",
      height: 120,
    });
  });

  it("refuses a remote href or src however the attribute is separated", () => {
    const sketches = [
      '<a/href="https://example.com/x">x</a>',
      "<a/href=https://example.com/x>x</a>",
      '<img/src="https://example.com/x.png">',
      '<a title="t"href="https://example.com/x">x</a>',
      '<svg><a/xlink:href="https://example.com/x"><text>t</text></a></svg>',
    ];
    const { issues, pages } = compile(
      onePage(sketches.map((html) => ({ type: "sketch", options: { html } }))),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal(
      sketches.map((_, index) => `/pages/0/tree/${index}/options/html`),
    );
    expect(pages[0].tree.map((node) => node.options?.html)).to.deep.equal(
      sketches.map(() => ""),
    );
  });

  it("refuses remote images and escaped at-rules in a sketch's CSS", () => {
    const styles = [
      'div{background:image-set("https://example.com/x" 1x)}',
      "div{background:image('https://example.com/x')}",
      "@\\69mport 'https://example.com/x';",
      'p{background:image-set("data:image/png;base64,AAAA" 1x, "http://example.com/x.png" 2x)}',
      "p{background:\\75rl(http://example.com/x.png)}",
      'p{background:u\\72l("http://example.com/x.png")}',
    ];
    const { issues } = compile(
      onePage(
        styles.map((css) => ({
          type: "sketch",
          options: { html: "<p>x</p>", css },
        })),
      ),
    );

    expect([...new Set(issues.map((issue) => issue.path))]).to.deep.equal(
      styles.map((_, index) => `/pages/0/tree/${index}/options/css`),
    );
  });

  it("refuses a handler or remote URL behind a quoted '>' and in inline styles", () => {
    const sketches = [
      '<a title=">" href="http://example.com">x</a>',
      '<a title=">" onclick=alert(1)>x</a>',
      "<p style=\"background:image-set('https://example.com/x' 1x)\">x</p>",
      "<style>p{background:\\75rl(http://example.com/x)}</style><p>x</p>",
    ];
    const { issues } = compile(
      onePage(sketches.map((html) => ({ type: "sketch", options: { html } }))),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal(
      sketches.map((_, index) => `/pages/0/tree/${index}/options/html`),
    );
  });

  it("keeps a sketch whose CSS escapes, data images and anchors stay local", () => {
    const { issues } = compile(
      onePage([
        {
          type: "sketch",
          options: {
            html: '<a href="#steps" title="see: notes">Steps</a><p>a &gt; b</p>',
            css: 'p::before{content:"\\2014 Step: 1"}p{background:image-set("data:image/png;base64,AAAA" 1x)}',
          },
        },
      ]),
    );

    expect(issues).to.deep.equal([]);
  });

  it("reports a child id its siblings already use, at the second", () => {
    const card = { type: "KpiCard", options: { title: "Revenue" } };
    const { issues } = compile(
      onePage([
        {
          type: "VStack",
          children: [
            { ...card, id: "kpi" },
            { ...card, id: "kpi" },
          ],
        },
      ]),
    );

    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/children/1/id",
        message: 'another child of this block already has the id "kpi"',
      },
    ]);
  });

  it("refuses a spec nested past the depth limit instead of overflowing the stack", () => {
    let node: Json = { type: "KpiCard", options: { title: "leaf" } };
    for (let level = 0; level < MAX_JSON_DEPTH; level += 1) {
      node = { type: "VStack", children: [node] };
    }
    const read = parseSpec(JSON.stringify(onePage([node])));

    const brackets = "[".repeat(MAX_JSON_DEPTH);
    const quoted = parseSpec(
      JSON.stringify(
        onePage([{ type: "KpiCard", options: { title: `\\"${brackets}` } }]),
      ),
    );

    expect(quoted.ok).to.equal(true);
    expect(read.ok).to.equal(false);
    expect(read.ok ? [] : read.issues).to.deep.equal([
      {
        path: "",
        message: `the spec nests deeper than ${MAX_JSON_DEPTH} levels`,
      },
    ]);
  });

  it("validates a block type a module registers at runtime", () => {
    RegisterBlockType({
      type: "MockupTestGauge",
      componentName: "mockup-test-gauge",
      meta: { name: "Gauge" },
      schema: z.object({ level: z.number().max(10) }),
    });

    const { issues } = compile(
      onePage([
        { type: "MockupTestGauge", options: { level: 4 } },
        { type: "MockupTestGauge", options: { level: 40 } },
      ]),
    );
    const schema = JSON.stringify(buildMockupSchema(ListBlockTypes()));

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/pages/0/tree/1/options/level",
    ]);
    expect(schema).to.contain('"const":"MockupTestGauge"');
  });

  it("builds a fixture-backed table through TableView.fromSource and reports a bad column type", () => {
    const rows = [{ _id: "r1", name: "Acme" }];
    const { issues } = compile(
      onePage(
        [
          {
            type: "TableView",
            options: {
              fetchUrl: "fixture:rows",
              columns: { name: { type: "no-such-type" } },
            },
          },
          {
            type: "TableView",
            options: {
              fetchUrl: "fixture:rows",
              columns: { name: { type: "string" } },
              labelKey: "missing",
            },
          },
        ],
        { rows },
      ),
    );

    expect(issues).to.deep.equal([
      {
        path: "/pages/0/tree/0/options/columns/name/type",
        message: 'no data type is registered as "no-such-type"',
      },
      {
        path: "/pages/0/tree/1/options",
        message:
          'TableView.fromSource(/api/mockup/demo/pages/home/fixtures/rows/rows) references unknown column "missing"',
      },
    ]);
  });

  it("refuses a spec whose pages repeat an id, at the second id", () => {
    const read = parseSpec(
      JSON.stringify({
        version: 1,
        pages: [
          { id: "a", title: "A", tree: [] },
          { id: "a", title: "B", tree: [] },
        ],
      }),
    );

    expect(read.ok ? [] : read.issues.map((issue) => issue.path)).to.deep.equal(
      ["/pages/1/id"],
    );
  });
});
