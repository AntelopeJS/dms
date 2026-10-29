import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

const valid = (
  type: string,
  options: Parameters<typeof ValidateBlockOptions>[1],
) => ValidateBlockOptions(type, options).valid;

/**
 * The options that let a module draw with stock blocks what it drew with its
 * own: a feed head's count and badge, an entry's third line, a top list's
 * unit.
 */
describe("[unit] interfaces/dms-base — ActivityFeed head and entry detail", () => {
  it("takes a count and a badge in its head, both optional", () => {
    const { config } = declared("ActivityFeed");
    expect(config.count?.optional).to.equal(true);
    expect(config.badge?.optional).to.equal(true);
    expect(valid("ActivityFeed", { count: 4, badge: "Last 24 h" })).to.equal(
      true,
    );
    expect(
      valid("ActivityFeed", { badge: { key: "$api.last", params: { n: 24 } } }),
    ).to.equal(true);
    expect(valid("ActivityFeed", { count: -1 })).to.equal(false);
  });

  it("takes visibleItems and wrap, both optional", () => {
    const { config } = declared("ActivityFeed");
    expect(config.visibleItems?.optional).to.equal(true);
    expect(config.wrap?.optional).to.equal(true);
    expect(valid("ActivityFeed", { visibleItems: 3, wrap: true })).to.equal(
      true,
    );
    expect(valid("ActivityFeed", { visibleItems: 0 })).to.equal(false);
  });

  it("takes a third line on an entry, as text or composed text", () => {
    const entry = declared("ActivityFeed").config.items?.items?.properties;
    expect(entry?.detail?.optional).to.equal(true);
    expect(
      valid("ActivityFeed", {
        items: [{ title: "POST /cart", detail: '400 "Cart is empty" × 16' }],
      }),
    ).to.equal(true);
  });
});

describe("[unit] interfaces/dms-base — TopListCard value unit", () => {
  it("takes a unit after each value and a written value per row", () => {
    expect(declared("TopListCard").config.valueSuffix?.optional).to.equal(true);
    expect(
      valid("TopListCard", {
        title: "Slowest routes",
        valueSuffix: " ms",
        staticItems: [
          { id: "a", title: "GET /orders", value: 1864 },
          {
            id: "b",
            title: "GET /cart",
            value: 296,
            valueLabel: "296 ms (partial)",
          },
        ],
      }),
    ).to.equal(true);
  });
});
