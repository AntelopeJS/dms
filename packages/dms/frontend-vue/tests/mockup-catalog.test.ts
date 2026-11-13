import { describe, expect, it } from "vitest";
import {
  acceptsChild,
  catalogSections,
  newBlock,
  parseBlockCatalog,
  type MockupBlockType,
} from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import { inspectorFields } from "../layers/dms-ui/app/entries/utils/mockupInspector";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", icon: "i-ph-trend-up", group: "visualization" },
  config: {
    title: {
      type: "string",
      ui: { label: "Title", group: "content", order: 2 },
    },
    description: {
      type: "string",
      optional: true,
      ui: {
        label: "Description",
        group: "content",
        widget: "textarea",
        order: 1,
      },
    },
    icon: {
      type: "string",
      optional: true,
      ui: { group: "appearance", widget: "icon" },
    },
    variant: {
      type: "string",
      optional: true,
      enum: ["card", "stat"],
      ui: {
        group: "appearance",
        widget: "segmented",
        valueLabels: { stat: "Stat" },
      },
    },
    compact: { type: "boolean", optional: true, ui: { group: "layout" } },
    fetchUrl: {
      type: "string",
      optional: true,
      ui: { group: "data", widget: "dataSource" },
    },
    fetchUrlMethod: {
      type: "string",
      optional: true,
      ui: { group: "advanced", widget: "select" },
    },
    trackId: {
      type: "string",
      optional: true,
      ui: { group: "content", hidden: true },
    },
    raw: {
      type: "string",
      optional: true,
      ui: { group: "content", advanced: true },
    },
    link: {
      type: "string",
      optional: true,
      ui: { group: "content", widget: "url" },
    },
    payload: { type: "object", optional: true, ui: { group: "content" } },
    untagged: { type: "string", optional: true },
  },
  defaults: { variant: "card" },
};

const CHART_LINE: MockupBlockType = {
  type: "ChartLine",
  componentName: "dms-chart-block",
  meta: { name: "Line chart", group: "visualization" },
  config: {
    smooth: {
      type: "boolean",
      optional: true,
      ui: { group: "appearance", initial: true },
    },
  },
  defaults: {},
};

const CHART_CARD: MockupBlockType = {
  type: "ChartCard",
  componentName: "dms-chart-card",
  meta: { name: "Chart card", group: "visualization" },
  config: {
    title: { type: "string", ui: { group: "content" } },
    chart: {
      type: "unknown",
      ui: { widget: "block", blockTypes: ["ChartLine"] },
    },
    period: { type: "string", enum: ["day", "week"], ui: { group: "content" } },
  },
  defaults: {},
};

const TOOLBAR: MockupBlockType = {
  type: "PageToolbar",
  componentName: "dms-page-toolbar",
  meta: { name: "Page toolbar", group: "data" },
  container: true,
  allowedChildren: ["LiveToggle"],
  config: {},
  defaults: {},
  initialChildren: [
    { id: "live", type: "LiveToggle", options: { paused: false } },
  ],
};

const GRID: MockupBlockType = {
  type: "Grid",
  componentName: "dms-grid-block",
  meta: { name: "Grid", group: "layout" },
  container: true,
  config: {},
  defaults: {},
};

const CATALOG = new Map(
  [KPI, CHART_LINE, CHART_CARD, TOOLBAR, GRID].map((block) => [
    block.type,
    block,
  ]),
);

describe("inspectorFields", () => {
  it("offers only visual options on Content, in ui.order then declaration order (fails when data, hidden, advanced or non-visual widgets leak in)", () => {
    expect(inspectorFields(KPI, "content").map((field) => field.key)).toEqual([
      "description",
      "title",
    ]);
  });

  it("puts appearance, layout and features on Style, each with its control, its choice labels and the default it shows unset (fails on a raw enum value as label or a lost default)", () => {
    const fields = inspectorFields(KPI, "style");
    expect(fields.map((field) => [field.key, field.control])).toEqual([
      ["icon", "icon"],
      ["variant", "segmented"],
      ["compact", "switch"],
    ]);
    expect(fields[1]?.fallback).toBe("card");
    expect(fields[0]?.fallback).toBeUndefined();
    expect(fields[1]?.choices).toEqual([
      { value: "card", label: "card" },
      { value: "stat", label: "Stat" },
    ]);
  });

  it("falls back on the option key as the label and on select for an untyped enum (fails when an enum renders as free text)", () => {
    const [period] = inspectorFields(CHART_CARD, "content").filter(
      (field) => field.key === "period",
    );
    expect(period).toMatchObject({ label: "period", control: "select" });
  });
});

describe("the catalog", () => {
  it("keeps the descriptors it can read and drops a malformed one (fails when one bad block empties the palette)", () => {
    const parsed = parseBlockCatalog({
      blocks: [KPI, { type: "Broken", meta: {} }],
    });
    expect(parsed?.map((block) => block.type)).toEqual(["KpiCard"]);
    expect(parseBlockCatalog({ items: [] })).toBeUndefined();
  });

  it("groups the matching blocks by palette group, in palette order (fails on a case-sensitive search or a lost group)", () => {
    const sections = catalogSections([...CATALOG.values()], "CHART");
    expect(
      sections.map((section) => [
        section.group,
        section.blocks.map((block) => block.type),
      ]),
    ).toEqual([["visualization", ["ChartLine", "ChartCard"]]]);
    expect(
      catalogSections([...CATALOG.values()], "").map(
        (section) => section.group,
      ),
    ).toEqual(["layout", "data", "visualization"]);
  });

  it("lets a container take only its allowed children, and a leaf none (fails when allowedChildren is ignored)", () => {
    expect(acceptsChild(TOOLBAR, "LiveToggle")).toBe(true);
    expect(acceptsChild(TOOLBAR, "KpiCard")).toBe(false);
    expect(acceptsChild(GRID, "KpiCard")).toBe(true);
    expect(acceptsChild(KPI, "KpiCard")).toBe(false);
  });
});

describe("newBlock", () => {
  it("starts from the defaults and fills a required title with the block's name (fails when the backend would refuse the node)", () => {
    expect(newBlock(KPI, CATALOG).node).toEqual({
      id: "kpi-card",
      type: "KpiCard",
      options: { variant: "card", title: "KPI card" },
    });
  });

  it("places a required block option as its child and its first enum value (fails when ChartCard starts without its chart)", () => {
    expect(newBlock(CHART_CARD, CATALOG).node).toEqual({
      id: "chart-card",
      type: "ChartCard",
      options: { title: "Chart card", period: "day" },
      children: [{ id: "chart", type: "ChartLine", options: { smooth: true } }],
    });
  });

  it("starts with the initial children the descriptor lists (fails when an editor keeps its own copy)", () => {
    expect(newBlock(TOOLBAR, CATALOG).node.children).toEqual([
      { id: "live", type: "LiveToggle", options: { paused: false } },
    ]);
  });
});
