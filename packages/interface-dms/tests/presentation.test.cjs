const assert = require("node:assert/strict");
const test = require("node:test");
const {
  IsSimpleBlockOption,
  BlockPresentationPaths,
} = require("../dist/base/block-registry/presentation");
const { ListBlockTypes } = require("../dist/base/block-types");

test("simple mode leaves binding to the builder, but not hidden or developer options", () => {
  assert.equal(
    IsSimpleBlockOption({ ui: { group: "data", widget: "resource" } }),
    true,
  );
  for (const ui of [
    { hidden: true },
    { advanced: true },
    { derivedFrom: "label" },
    { group: "advanced" },
  ]) {
    assert.equal(IsSimpleBlockOption({ ui }), false);
  }
});

test("presentation edits leaves, never a parent that can replace data or factory constants", () => {
  const config = {
    title: { type: "string" },
    mixed: {
      type: "object",
      properties: {
        label: { type: "string" },
        resource: { type: "string", ui: { widget: "resource" } },
        hidden: { type: "boolean", ui: { hidden: true } },
      },
    },
    fixed: { type: "object", properties: { label: { type: "string" } } },
    data: {
      type: "object",
      ui: { group: "data" },
      properties: { label: { type: "string" } },
    },
    json: {
      type: "object",
      ui: { widget: "json" },
      properties: { label: { type: "string" } },
    },
    rows: { type: "array", items: { type: "string" } },
    record: { type: "record", values: { type: "string" } },
    incomplete: {
      type: "object",
      truncated: true,
      properties: { label: { type: "string" } },
    },
    derived: { type: "string", ui: { derivedFrom: "title" } },
    intersection: { type: "object", allOf: [{ type: "string" }] },
    union: {
      type: "union",
      ui: { widget: "text" },
      oneOf: [
        { type: "string" },
        {
          type: "object",
          properties: {
            source: { type: "string", ui: { widget: "dataSource" } },
          },
        },
      ],
    },
  };
  const descriptor = { config, fixedOptions: { fixed: { label: "constant" } } };
  const before = structuredClone(descriptor);
  assert.deepEqual(BlockPresentationPaths(descriptor), [
    "title",
    "mixed.label",
  ]);
  assert.deepEqual(descriptor, before);
});

test("real chart presentation keeps axes and appearance, without source or fixture controls", () => {
  const blocks = ListBlockTypes();
  const chart = blocks.find((block) => block.type === "ChartLine");
  const paths = BlockPresentationPaths(chart);
  assert.ok(paths.includes("showLegend"));
  assert.ok(paths.includes("yRange.min"));
  assert.ok(paths.includes("color"));
  assert.ok(!paths.includes("fetchUrl"));
  assert.ok(!paths.includes("staticDataset"));
  assert.deepEqual(
    BlockPresentationPaths(
      blocks.find((block) => block.type === "Placeholder"),
    ),
    ["label"],
  );
  for (const block of blocks) {
    for (const path of BlockPresentationPaths(block)) {
      assert.ok(!Object.hasOwn(block.fixedOptions ?? {}, path.split(".")[0]));
    }
  }
});

test("closed presentation collections and scalar unions do not open fixture collections", () => {
  const scalar = {
    type: "union",
    oneOf: [{ type: "number" }, { type: "string" }, { type: "boolean" }],
  };
  const enumItems = { type: "string", enum: ["a", "b"] };
  const config = {
    count: scalar,
    choices: { type: "array", items: enumItems, ui: { group: "behavior" } },
    labels: { type: "record", keys: enumItems, values: scalar },
    rows: { type: "array", items: enumItems, ui: { group: "content" } },
    data: { type: "array", items: enumItems, ui: { group: "data" } },
    fields: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" } } },
      ui: { group: "behavior" },
    },
    linkedLabels: {
      type: "record",
      keys: enumItems,
      values: { type: "string", ui: { widget: "field" } },
    },
    openKeys: { type: "record", keys: { type: "string" }, values: scalar },
    mixed: {
      type: "union",
      oneOf: [
        scalar,
        { type: "object", properties: { data: { type: "string" } } },
      ],
    },
  };
  assert.deepEqual(BlockPresentationPaths({ config }), [
    "count",
    "choices",
    "labels",
  ]);
  const blocks = ListBlockTypes();
  assert.ok(
    BlockPresentationPaths(
      blocks.find((block) => block.type === "Card"),
    ).includes("count"),
  );
  const period = BlockPresentationPaths(
    blocks.find((block) => block.type === "PeriodSelector"),
  );
  for (const name of [
    "presets",
    "comparisons",
    "presetLabels",
    "comparisonLabels",
  ])
    assert.ok(period.includes(name));
});
