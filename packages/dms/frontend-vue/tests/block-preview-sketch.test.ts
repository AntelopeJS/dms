/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import {
  collectPreviewIssues,
  resolvePreviewTree,
  type PreviewBlockTypes,
  type PreviewSketch,
} from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  SKETCH_CSP,
  sketchTokensCss,
} from "../layers/dms-ui/app/entries/utils/sketch";
import BlockPreviewSketch from "../layers/dms-ui/app/entries/components/block-preview/BlockPreviewSketch";

const BLOCK_TYPES: PreviewBlockTypes = {
  Card: { componentName: "dms-card-block" },
};

describe("sketch nodes", () => {
  it("resolves a sketch node to a sketch, not an unknown block", () => {
    const [node] = resolvePreviewTree(
      { type: "sketch", options: { html: "<p>Hi</p>", css: "p{color:red}" } },
      BLOCK_TYPES,
    );
    expect(node.issue).toBeUndefined();
    expect(node.sketch).toEqual({
      html: "<p>Hi</p>",
      css: "p{color:red}",
      height: 320,
    });
    expect(node.componentName).toBeUndefined();
  });

  it("keeps the caption and clamps the height to the sketch bounds", () => {
    const heights = [10, 5000, 410.4, "tall"].map(
      (height) =>
        resolvePreviewTree(
          {
            type: "sketch",
            options: { html: "", caption: "x".repeat(300), height },
          },
          BLOCK_TYPES,
        )[0].sketch,
    );
    expect(heights.map((sketch) => sketch?.height)).toEqual([
      80, 1200, 410, 320,
    ]);
    expect(heights[0]?.caption).toHaveLength(200);
  });

  it.each([
    ["no options", undefined],
    ["no html", { css: "p{}" }],
    ["a html that is not a string", { html: 3 }],
  ])("refuses a sketch with %s and says why", (_label, options) => {
    const nodes = resolvePreviewTree(
      { type: "sketch", ...(options && { options }) },
      BLOCK_TYPES,
    );
    expect(nodes[0].sketch).toBeUndefined();
    expect(collectPreviewIssues(nodes)).toEqual([
      { key: "invalid_sketch", name: "sketch" },
    ]);
  });

  it("keeps the slot and span of a sketch placed in a container", () => {
    const [card] = resolvePreviewTree(
      {
        type: "Card",
        children: [
          {
            id: "mock",
            type: "sketch",
            slot: "footer",
            colSpan: 2,
            options: { html: "<b>x</b>" },
          },
        ],
      },
      BLOCK_TYPES,
    );
    expect(card.children[0]).toMatchObject({
      id: "mock",
      slot: "footer",
      colSpan: 2,
      sketch: { html: "<b>x</b>" },
    });
  });
});

describe("sketch tokens", () => {
  it("falls back to the dashboard default when a variable is unset or unsafe", () => {
    const css = sketchTokensCss("dark", (variable) =>
      variable === "--ui-primary" ? "#123456" : "red;}</style><script>",
    );
    expect(css).toContain("--sketch-accent:#123456;");
    expect(css).toContain("--sketch-canvas:#07090b;");
    expect(css).not.toContain("<script>");
  });
});

let app: App | undefined;
let host: HTMLElement;

function mountSketch(sketch: PreviewSketch): void {
  app = createApp({ render: () => h(BlockPreviewSketch, { sketch }) });
  app.mount(host);
}

async function settle(): Promise<void> {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
}

const frame = () => host.querySelector("iframe");

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  host = document.createElement("div");
  document.body.append(host);
  document.documentElement.className = "light";
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("sketch frame", () => {
  it("is sandboxed with nothing granted and carries the CSP before the sketch", async () => {
    mountSketch({
      html: "<script>alert(1)</script><p>Body</p>",
      css: "p{color:red}",
      height: 200,
    });
    await settle();
    expect(frame()?.getAttribute("sandbox")).toBe("");
    const srcdoc = frame()?.getAttribute("srcdoc") ?? "";
    const csp = srcdoc.indexOf(`content="${SKETCH_CSP}"`);
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(srcdoc.indexOf("p{color:red}"));
    expect(csp).toBeLessThan(srcdoc.indexOf("<p>Body</p>"));
    expect(frame()?.style.height).toBe("200px");
  });

  it("is labelled Custom, with its caption, so it is not taken for a block", async () => {
    mountSketch({ html: "<p>x</p>", height: 320, caption: "Hero idea" });
    await settle();
    expect(
      host.querySelector("[data-dms-preview-sketch-label]")?.textContent,
    ).toBe("dms.block_preview.sketch_label");
    expect(
      host.querySelector("[data-dms-preview-sketch-caption]")?.textContent,
    ).toBe("Hero idea");
  });

  it("follows the dashboard's theme switch", async () => {
    mountSketch({ html: "<p>x</p>", height: 320 });
    await settle();
    expect(frame()?.getAttribute("srcdoc")).toContain("--sketch-scheme:light;");
    document.documentElement.className = "dark";
    await settle();
    expect(frame()?.getAttribute("srcdoc")).toContain("--sketch-scheme:dark;");
  });
});
