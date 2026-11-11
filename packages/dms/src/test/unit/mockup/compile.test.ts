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
          type: "Grid",
          options: { gap: "1rem", minColumnWidth: "200px" },
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
