import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { z } from "zod";
import {
  buildMockupSchema,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  MockupStore,
  parseSpec,
} from "../../../mockup";

const DEMO = mockupNameSchema.parse("demo");

const PLAN: JsonObject = {
  id: "plan",
  title: "Your plan",
  html: '<div class="plan">Pro, 3 seats left</div>',
  css: ".plan { padding: 8px; }",
};

function specWith(widgets: Json[]): JsonObject {
  return {
    version: 1,
    sidebar: { widgets },
    pages: [{ id: "home", title: "Home", tree: [] }],
  };
}

function compiled(spec: JsonObject) {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

function issuesOf(spec: JsonObject): string[] {
  const read = parseSpec(JSON.stringify(spec));
  return read.ok ? [] : read.issues.map((issue) => issue.path);
}

const schemaSchema = z.object({
  properties: z.object({
    sidebar: z.object({
      properties: z.object({
        widgets: z.object({
          items: z.object({
            required: z.array(z.string()),
            properties: z.record(z.string(), z.unknown()),
          }),
        }),
      }),
    }),
  }),
});

describe("[unit] mockup sidebar widgets", () => {
  it("carries each widget into the compiled state, its markup checked and its height set (fails when the widgets are dropped or a widget has no height)", () => {
    const { sidebar, issues } = compiled(
      specWith([PLAN, { id: "help", html: "<p>Need help?</p>", height: 200 }]),
    );

    expect(issues).to.deep.equal([]);
    expect(sidebar).to.deep.equal({
      widgets: [
        {
          id: "plan",
          title: "Your plan",
          html: '<div class="plan">Pro, 3 seats left</div>',
          css: ".plan { padding: 8px; }",
          height: 120,
        },
        { id: "help", html: "<p>Need help?</p>", height: 200 },
      ],
    });
  });

  it("leaves the state without a sidebar when the spec adds none (fails when every mockup gets an empty widget list)", () => {
    expect(compiled(specWith([])).sidebar).to.equal(undefined);
    const { sidebar: _sidebar, ...bare } = specWith([]);
    expect(compiled(bare).sidebar).to.equal(undefined);
  });

  it("refuses markup a sketch may not hold, at the widget's field, and draws none of it (fails when a script reaches the sidebar)", () => {
    const { sidebar, issues } = compiled(
      specWith([
        { id: "plan", html: "<p>Plan</p><script>alert(1)</script>" },
        {
          id: "help",
          html: "<p>Help</p>",
          css: "p { background: url(https://example.com/x.png); }",
        },
      ]),
    );

    expect(issues.map((issue) => issue.path)).to.deep.equal([
      "/sidebar/widgets/0/html",
      "/sidebar/widgets/1/css",
    ]);
    expect(sidebar?.widgets.map((widget) => widget.html)).to.deep.equal([
      "",
      "",
    ]);
    expect(sidebar?.widgets[1]?.css).to.equal(undefined);
  });

  it("refuses a widget id given twice, a height outside the sketch bounds and an unknown field, each at its pointer (fails when two widgets share an id)", () => {
    expect(
      issuesOf(specWith([PLAN, { ...PLAN, title: "Again" }])),
    ).to.deep.equal(["/sidebar/widgets/1/id"]);
    expect(
      issuesOf(
        specWith([
          { id: "plan", html: "", height: 40 },
          { id: "help", html: "", color: "red" },
        ]),
      ),
    ).to.deep.equal(["/sidebar/widgets/0/height", "/sidebar/widgets/1"]);
  });

  it("describes the widgets in the JSON Schema, an id and markup required", () => {
    const schema = schemaSchema.parse(buildMockupSchema(ListBlockTypes()));
    const { items } = schema.properties.sidebar.properties.widgets;

    expect(items.required).to.deep.equal(["id", "html"]);
    expect(Object.keys(items.properties)).to.deep.equal([
      "id",
      "title",
      "html",
      "css",
      "height",
    ]);
  });

  describe("in the store", () => {
    let root: string;
    let store: MockupStore;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "dms-mockups-"));
      await mkdir(join(root, DEMO));
      await writeFile(
        join(root, DEMO, "spec.json"),
        JSON.stringify(specWith([PLAN])),
      );
      store = new MockupStore(root);
    });

    afterEach(async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    it("hands the widgets to the viewer, and keeps them while spec.json is unreadable (fails when the viewer's state has no sidebar)", async () => {
      const good = await store.state(DEMO);
      await writeFile(join(root, DEMO, "spec.json"), '{ "version": 1, ');
      const broken = await store.state(DEMO);

      expect(good?.sidebar?.widgets.map((widget) => widget.id)).to.deep.equal([
        "plan",
      ]);
      expect(broken?.sidebar).to.deep.equal(good?.sidebar);
    });
  });
});
