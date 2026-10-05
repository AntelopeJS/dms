import { expect } from "chai";
import {
  ActivityFeed,
  Banner,
  BannerSchema,
  Card,
  EmptyState,
  FieldRow,
  KeyValueList,
  Meter,
  NavCardGrid,
  Section,
  StatStrip,
} from "@antelopejs/interface-dms/base";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import {
  resolveToneAlias,
  TONES,
} from "@antelopejs/interface-dms/base/types/tone";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

const LIST_BLOCKS = [
  "StatStrip",
  "KeyValueList",
  "NavCardGrid",
  "ActivityFeed",
];

/**
 * The blocks share one vocabulary: one set of tones, one `card` flag, `to`
 * for a link and `actions` for link buttons, `{ items }` and `empty` for a
 * list, a `dms-xxx-block` component name.
 */
describe("[unit] interfaces/dms-base — block vocabulary", () => {
  it("names every block component dms-xxx-block", () => {
    const builders = [
      ActivityFeed(),
      Banner(),
      Card(),
      EmptyState({ title: "Nothing" }),
      FieldRow(),
      KeyValueList(),
      Meter(),
      NavCardGrid(),
      Section(),
      StatStrip(),
    ];
    for (const builder of builders) {
      expect(builder.serializeSync().componentName).to.match(
        /^dms-[a-z-]+-block$/,
      );
    }
  });

  it("colours the blocks with the one tone vocabulary", () => {
    const feedItem = declared("ActivityFeed").config.items?.items?.properties;
    expect(feedItem?.tone?.enum).to.deep.equal([...TONES]);
    expect(declared("Meter").config.tone?.enum).to.deep.equal([
      ...TONES,
      "soft",
    ]);
    expect(declared("StatStrip").config.items?.items?.properties?.tone?.enum)
      .to.include("muted")
      .and.not.include("accent");
  });

  it("reads a deprecated tone as the current one", () => {
    expect(resolveToneAlias("accent")).to.equal("primary");
    expect(resolveToneAlias("ok")).to.equal("success");
    expect(resolveToneAlias("warning")).to.equal("warning");
    expect(BannerSchema.parse({ tone: "accent" }).tone).to.equal("primary");

    const meter = Meter({
      tone: "accent" as never,
      segments: [{ value: 1, tone: "accent" as never }],
    }).serializeSync().options;
    expect(meter?.tone).to.equal("primary");
    expect(meter?.segments?.[0]?.tone).to.equal("primary");

    const feed = ActivityFeed({
      items: [{ title: "Deployed", tone: "accent" as never }],
    }).serializeSync().options;
    expect(feed?.items?.[0]?.tone).to.equal("primary");
  });

  it("frames each block with `card`, on or off by default", () => {
    expect(declared("Section").defaults.card).to.equal(true);
    expect(declared("ActivityFeed").defaults.card).to.equal(true);
    expect(declared("KeyValueList").defaults.card).to.equal(true);
    expect(declared("EmptyState").defaults.card).to.equal(true);
    expect(declared("Meter").defaults.card).to.equal(false);
    expect(declared("EmptyState").config).to.include.keys("hatched");
  });

  it("links with `to` and offers link buttons as `actions`", () => {
    for (const type of ["StatStrip", "KeyValueList"]) {
      const item = declared(type).config.items?.items?.properties ?? {};
      expect(item, type).to.include.keys("to").and.not.include.keys("href");
    }
    for (const type of ["ActivityFeed", "Meter", "Card", "Banner"]) {
      expect(declared(type).config, type).to.include.keys("actions");
    }
  });

  it("reads every data source through the source picker", () => {
    for (const type of [...LIST_BLOCKS, "Meter"]) {
      expect(declared(type).config.fetchUrl?.ui?.widget, type).to.equal(
        "dataSource",
      );
    }
  });

  it("gives every list block the same empty state", () => {
    for (const type of LIST_BLOCKS) {
      const empty = declared(type).config.empty;
      expect(empty?.properties, type).to.include.keys("title", "description");
    }
  });
});
