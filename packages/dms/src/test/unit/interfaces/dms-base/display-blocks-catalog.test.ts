import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { StatGroup } from "@antelopejs/interface-dms/base/stat-group";

const DISPLAY_BLOCKS = [
  "StatGroup",
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
    const cell = declared("StatGroup").config.items?.items?.properties ?? {};

    expect(cell.eyebrow?.optional).to.not.equal(true);
    expect(cell.tone?.enum).to.include("muted");
    expect(cell.to?.ui?.widget).to.equal("url");
  });

  it("keeps a list block's route for the advanced view", () => {
    for (const type of ["StatGroup", "KeyValueList", "NavCardGrid"]) {
      expect(declared(type).config.fetchUrl?.ui?.advanced, type).to.equal(true);
    }
  });

  it("lets a fetched block follow a period scope and realtime topics", () => {
    for (const type of [
      "StatGroup",
      "KeyValueList",
      "NavCardGrid",
      "ActivityFeed",
      "Meter",
    ]) {
      const { config } = declared(type);
      expect(config.fetchUrl?.ui?.periodOption, type).to.equal("periodScope");
      expect(config.periodScope?.optional, type).to.equal(true);
      expect(config.realtimeTopic?.ui?.advanced, type).to.equal(true);
    }
    expect(declared("Tab").config.realtimeTopic?.optional).to.equal(true);
  });

  it("lets a fetched block say how many placeholders to draw, unset by default", () => {
    for (const type of [
      "StatGroup",
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
    expect(declared("StatGroup").defaults.layout).to.equal("joined");
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

  it("accepts a composed text wherever a block text goes", () => {
    const mrr = {
      key: "saas.stats.mrr",
      params: {
        amount: { type: "money", value: 92200, currency: "EUR" },
        since: { type: "relative", value: "2026-10-01T00:00:00Z" },
        plan: { key: "$saas.plans.business" },
        seats: { type: "count", value: 3 },
      },
      plural: "seats",
    };

    expect(
      ValidateBlockOptions("StatGroup", {
        items: [{ eyebrow: mrr, value: mrr, detail: mrr }],
      }).valid,
    ).to.equal(true);
    expect(
      ValidateBlockOptions("KeyValueList", {
        items: [{ label: mrr, value: mrr, detail: mrr }],
      }).valid,
    ).to.equal(true);
    expect(
      ValidateBlockOptions("Banner", { title: mrr, description: mrr }).valid,
    ).to.equal(true);
  });

  it("keeps describing a block text as a text field to the page builder", () => {
    const cell = declared("StatGroup").config.items?.items?.properties ?? {};

    expect(cell.value?.ui?.widget).to.equal("text");
    expect(declared("Banner").config.title?.ui?.widget).to.equal("text");
  });

  it("refuses a composed text parameter of an unknown type", () => {
    const result = ValidateBlockOptions("StatGroup", {
      items: [
        {
          eyebrow: "MRR",
          value: {
            key: "saas.stats.mrr",
            params: { amount: { type: "bitcoin", value: 1 } },
          },
        },
      ],
    });

    expect(result.valid).to.equal(false);
  });

  it("writes a placed block that is not configured yet as a valid one", () => {
    const placed = StatGroup().serializeSync().options;

    expect(placed).to.deep.equal({ layout: "joined" });
    expect(ValidateBlockOptions("StatGroup", placed).valid).to.equal(true);
  });
});
