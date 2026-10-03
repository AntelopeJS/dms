import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { StatStrip } from "@antelopejs/interface-dms/base/stat-strip";

const DISPLAY_BLOCKS = [
  "StatStrip",
  "KeyValueList",
  "NavCardGrid",
  "EmptyState",
  "Banner",
  "Card",
];

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

/**
 * The display blocks are placed and configured from the page builder, so each
 * one has to be in the catalog with its options described, and the frontend
 * component it names has to be the block wrapper that resolves `$` keys and
 * fetches its items — not the bare generic component.
 */
describe("[unit] interfaces/dms-base/display blocks — in the catalog", () => {
  it("declares every display block with a block component", () => {
    for (const type of DISPLAY_BLOCKS) {
      expect(declared(type).componentName, type).to.match(/^dms-.+-block$/);
    }
  });

  it("describes the items of a list block field by field", () => {
    const cell = declared("StatStrip").config.items?.items?.properties ?? {};

    expect(cell.eyebrow?.optional).to.not.equal(true);
    expect(cell.tone?.enum).to.include("muted");
    expect(cell.href?.ui?.widget).to.equal("url");
  });

  it("keeps a list block's route for the advanced view", () => {
    for (const type of ["StatStrip", "KeyValueList", "NavCardGrid"]) {
      expect(declared(type).config.fetchUrl?.ui?.advanced, type).to.equal(true);
    }
  });

  it("lets a fetched block say how many placeholders to draw, unset by default", () => {
    for (const type of [
      "StatStrip",
      "KeyValueList",
      "NavCardGrid",
      "ActivityFeed",
      "TopListCard",
    ]) {
      const option = declared(type).config.skeletonCount;
      expect(option?.optional, type).to.equal(true);
      expect(declared(type).defaults.skeletonCount, type).to.equal(undefined);
    }
  });

  it("says what a block falls back on when an option is unset", () => {
    expect(declared("StatStrip").defaults.layout).to.equal("joined");
    expect(declared("KeyValueList").defaults.card).to.equal(true);
    expect(declared("EmptyState").defaults.variant).to.equal("no-data");
    expect(declared("Banner").defaults.tone).to.equal("info");
    expect(declared("Card").defaults.padded).to.equal(true);
  });

  it("lets a card hold children in its body, head and foot", () => {
    const card = declared("Card");

    expect(card.container).to.equal(true);
    expect(card.slots?.map((slot) => slot.id)).to.deep.equal([
      "actions",
      "footer",
    ]);
  });

  it("refuses a value type a key / value row cannot draw", () => {
    const result = ValidateBlockOptions("KeyValueList", {
      items: [{ label: "Plan", value: "Business", type: "chart" }],
    });

    expect(result.valid).to.equal(false);
  });

  it("writes a placed block that is not configured yet as a valid one", () => {
    const placed = StatStrip().serializeSync().options;

    expect(placed).to.deep.equal({ layout: "joined" });
    expect(ValidateBlockOptions("StatStrip", placed).valid).to.equal(true);
  });
});
