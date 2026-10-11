import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { Grid } from "@antelopejs/interface-dms/base/grid";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

const valid = (type: string, options: Record<string, unknown>) =>
  ValidateBlockOptions(type, options).valid;

/**
 * The options that let a module draw with stock blocks what it drew with its
 * own: a feed head's count and badge, an entry's third line, a top list's
 * unit, and a grid giving way to one empty state.
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

describe("[unit] interfaces/dms-base — Grid emptyWhen", () => {
  const emptyWhen = {
    fetchUrl: "/api/routes/activity?route={{query.route}}",
    field: "calls",
    emptyState: {
      title: "No calls yet",
      actions: [{ label: "Test this route", to: "/routes?tab=2" }],
    },
  };

  it("is an optional, advanced option of the grid", () => {
    const option = declared("Grid").config.emptyWhen;
    expect(option?.optional).to.equal(true);
    expect(option?.ui?.advanced).to.equal(true);
  });

  it("needs a route, a field and the empty state to show", () => {
    expect(valid("Grid", { emptyWhen })).to.equal(true);
    expect(
      valid("Grid", { emptyWhen: { ...emptyWhen, field: undefined } }),
    ).to.equal(false);
    expect(
      valid("Grid", { emptyWhen: { ...emptyWhen, emptyState: {} } }),
    ).to.equal(false);
  });

  it("serializes the option with the grid's defaults", async () => {
    const serialized = await Grid({ emptyWhen }).serialize();
    expect(serialized.options).to.deep.include({
      gap: "1rem",
      emptyWhen,
    });
  });
});
