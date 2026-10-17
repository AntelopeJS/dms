import { describe, expect, it } from "vitest";
import {
  collectPreviewIssues,
  decodePreviewState,
  encodePreviewState,
  findRefusedOption,
  isRelativePath,
  parsePreviewMessage,
  PREVIEW_CHANNEL,
  previewResizeMessage,
  resolvePreviewTree,
  type PreviewBlockTypes,
  type PreviewState,
} from "../layers/dms-ui/app/build/utils/blockPreview";

const BLOCK_TYPES: PreviewBlockTypes = {
  KpiCard: { componentName: "dms-kpi-card" },
  ChartLine: { componentName: "dms-chart", fixedOptions: { type: "line" } },
  Card: { componentName: "dms-card-block" },
  TableView: { componentName: "dms-table-view", needsController: true },
  ResourceForm: { componentName: "dms-form", needsController: true },
};

describe("preview state parameter", () => {
  it("round-trips a state through base64url, accents included", () => {
    const state: PreviewState = {
      tree: [{ type: "KpiCard", options: { title: "Chiffre d’affaires €" } }],
      theme: "dark",
      locale: "fr-FR",
      padding: false,
      transparent: true,
    };
    const encoded = encodePreviewState(state);
    expect(encoded).toMatch(/^[\w-]+$/);
    expect(decodePreviewState(encoded)).toEqual(state);
  });

  it("decodes what Node's base64url encoding writes", () => {
    const state = { tree: { type: "KpiCard" }, theme: "light" };
    const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
    expect(decodePreviewState(encoded)).toEqual(state);
  });

  it("refuses garbage, a missing tree and an unknown theme", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(decodePreviewState("%%%")).toBeUndefined();
    expect(decodePreviewState(encode({ theme: "dark" }))).toBeUndefined();
    expect(
      decodePreviewState(encode({ tree: { type: "KpiCard" }, theme: "sepia" })),
    ).toBeUndefined();
    expect(decodePreviewState(encode({ tree: [{ type: 3 }] }))).toBeUndefined();
  });

  it("refuses a transparent flag that is not a boolean", () => {
    const encoded = Buffer.from(
      JSON.stringify({ tree: { type: "KpiCard" }, transparent: "yes" }),
    ).toString("base64url");
    expect(decodePreviewState(encoded)).toBeUndefined();
  });
});

describe("preview allowlist", () => {
  it("maps a registry type to its component, fixed options over its own", () => {
    const [node] = resolvePreviewTree(
      { type: "ChartLine", options: { title: "Sales", type: "bar" } },
      BLOCK_TYPES,
    );
    expect(node).toMatchObject({
      id: "block-0",
      componentName: "dms-chart",
      options: { title: "Sales", type: "line" },
    });
    expect(node.issue).toBeUndefined();
  });

  it("accepts a component name only when a registered type emits it", () => {
    const [known, unknown] = resolvePreviewTree(
      [{ componentName: "DmsKpiCard" }, { componentName: "dms-onboarding" }],
      BLOCK_TYPES,
    );
    expect(known.componentName).toBe("dms-kpi-card");
    expect(unknown.componentName).toBeUndefined();
    expect(unknown.issue).toEqual({
      key: "unknown_block",
      name: "dms-onboarding",
    });
  });

  it("refuses inherited keys as type names", () => {
    const [node] = resolvePreviewTree({ type: "constructor" }, BLOCK_TYPES);
    expect(node.issue?.key).toBe("unknown_block");
  });

  it("keeps children, their slots and spans, checked the same way", () => {
    const [card] = resolvePreviewTree(
      {
        type: "Card",
        children: [
          { id: "kpi", type: "KpiCard", colSpan: 2 },
          { type: "Nope", slot: "footer" },
        ],
      },
      BLOCK_TYPES,
    );
    expect(card.children.map(({ id }) => id)).toEqual(["kpi", "1"]);
    expect(card.children[0]).toMatchObject({ colSpan: 2 });
    expect(card.children[1]).toMatchObject({ slot: "footer" });
    expect(collectPreviewIssues([card])).toEqual([
      { key: "unknown_block", name: "Nope" },
    ]);
  });

  it("does not draw a block that needs a backend resource", () => {
    const [node] = resolvePreviewTree({ type: "TableView" }, BLOCK_TYPES);
    expect(node.issue).toEqual({ key: "needs_backend", name: "TableView" });
    expect(node.options).toEqual({});
  });
});

describe("route-sourced blocks", () => {
  it("renders a serialized resource form only against the read-only demo record", () => {
    const options = {
      fields: [{ id: "name", component: { componentName: "dms-input-text" } }],
      fetchUrl: "/api/block-preview/fixtures/workspace",
    };
    const [node] = resolvePreviewTree(
      { type: "ResourceForm", options },
      BLOCK_TYPES,
    );
    expect(node.issue).toBeUndefined();
    expect(node.componentName).toBe("dms-form");
    expect(node.options).toEqual(options);
    for (const changed of [
      { ...options, fetchUrl: "/api/private/workspace" },
      { ...options, submitUrl: "/api/private/workspace" },
      { ...options, fields: undefined },
    ]) {
      expect(
        resolvePreviewTree(
          { type: "ResourceForm", options: changed },
          BLOCK_TYPES,
        )[0].issue?.key,
      ).toBe("needs_backend");
    }
  });

  it("draws a table view built from a route, checking its routes", () => {
    const fromSource = {
      location: "/api/requests",
      source: { fetchUrl: "/api/requests" },
    };
    const [table] = resolvePreviewTree(
      { type: "TableView", options: fromSource },
      BLOCK_TYPES,
    );
    expect(table.issue).toBeUndefined();
    expect(table.componentName).toBe("dms-table-view");
    const [external] = resolvePreviewTree(
      {
        type: "TableView",
        options: { ...fromSource, location: "https://evil.example" },
      },
      BLOCK_TYPES,
    );
    expect(external.issue?.key).toBe("unsafe_url");
  });
});

describe("preview option rules", () => {
  it("accepts only paths of the site as URLs", () => {
    expect(isRelativePath("/api/blocks/stats?period=7d")).toBe(true);
    expect(isRelativePath("https://evil.example/x")).toBe(false);
    expect(isRelativePath("//evil.example/x")).toBe(false);
    expect(isRelativePath("/\\evil.example/x")).toBe(false);
    expect(isRelativePath("api/relative")).toBe(false);
  });

  it("finds a refused URL or write method at any depth", () => {
    expect(
      findRefusedOption({ chart: { fetchUrl: "https://evil.example" } }),
    ).toEqual({ issue: "unsafe_url", value: "https://evil.example" });
    expect(
      findRefusedOption({ fetchUrl: "/api/x", fetchUrlMethod: "DELETE" }),
    ).toEqual({ issue: "unsafe_method", value: "DELETE" });
    expect(
      findRefusedOption({ items: [{ badgesUrl: "javascript:alert(1)" }] }),
    ).toEqual({ issue: "unsafe_url", value: "javascript:alert(1)" });
    expect(
      findRefusedOption({ fetchUrl: "/api/x", fetchUrlMethod: "get" }),
    ).toBeUndefined();
  });

  it("turns a block with a refused option into an issue", () => {
    const [node] = resolvePreviewTree(
      { type: "KpiCard", options: { fetchUrl: "https://evil.example" } },
      BLOCK_TYPES,
    );
    expect(node.issue).toEqual({
      key: "unsafe_url",
      name: "KpiCard",
      value: "https://evil.example",
    });
  });
});

describe("preview messages", () => {
  it("reads render and theme messages of its channel", () => {
    const render = {
      channel: PREVIEW_CHANNEL,
      type: "render",
      tree: [{ type: "KpiCard" }],
      theme: "dark",
      transparent: true,
    };
    expect(parsePreviewMessage(render)).toEqual(render);
    expect(
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "theme",
        theme: "light",
      }),
    ).toEqual({ channel: PREVIEW_CHANNEL, type: "theme", theme: "light" });
  });

  it("ignores other channels, unknown types and malformed payloads", () => {
    expect(parsePreviewMessage({ type: "render", tree: {} })).toBeUndefined();
    expect(
      parsePreviewMessage({ channel: PREVIEW_CHANNEL, type: "eval" }),
    ).toBeUndefined();
    expect(
      parsePreviewMessage({ channel: PREVIEW_CHANNEL, type: "render" }),
    ).toBeUndefined();
    expect(
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "theme",
        theme: "blue",
      }),
    ).toBeUndefined();
    expect(
      parsePreviewMessage({ channel: PREVIEW_CHANNEL, type: "constructor" }),
    ).toBeUndefined();
    expect(
      parsePreviewMessage({
        channel: PREVIEW_CHANNEL,
        type: "render",
        tree: [],
        transparent: 1,
      }),
    ).toBeUndefined();
    expect(parsePreviewMessage("render")).toBeUndefined();
  });

  it("rounds a resize up to whole pixels", () => {
    expect(previewResizeMessage(120.2)).toEqual({
      channel: PREVIEW_CHANNEL,
      type: "resize",
      height: 121,
    });
  });
});
