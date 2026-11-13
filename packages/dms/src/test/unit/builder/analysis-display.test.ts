import { expect } from "chai";
import type {
  BadgeItem,
  ColumnDisplay,
  MappingProposal,
  ProposedField,
  ProposedResource,
} from "@antelopejs/interface-dms-builder";
import { proposeMapping } from "../../../implementations/dms-builder/engine";
import {
  Column,
  Input,
  Profiled,
  Reference,
  Relation,
  type ColumnTraits,
} from "./analysis-catalog";

const ORDERS_CUSTOMER = Reference(
  "shop.orders",
  "customer_id",
  "shop.customers",
  "id",
);

const CUSTOMERS = Relation({
  relation: "shop.customers",
  key: ["id"],
  columns: [
    Column("id", "string", { nullable: false }),
    Column("name", "string"),
  ],
  referencedBy: [ORDERS_CUSTOMER],
});

const ENUM: ColumnTraits["traits"] = ["enum-like"];

function ordersOf(extra: ReturnType<typeof Column>[]) {
  return Relation({
    relation: "shop.orders",
    key: ["id"],
    columns: [
      Column("id", "string", { nullable: false }),
      Column("reference", "string"),
      Column("customer_id", "string"),
      ...extra,
    ],
    references: [ORDERS_CUSTOMER],
  });
}

function propose(
  extra: ReturnType<typeof Column>[],
  columns: Record<string, ColumnTraits>,
  rows = 1000,
): ProposedResource {
  const proposal: MappingProposal = proposeMapping(
    Input(
      [CUSTOMERS, ordersOf(extra)],
      [
        Profiled("shop.customers", 50, {
          name: { traits: ["label-candidate"] },
        }),
        Profiled("shop.orders", rows, {
          reference: { traits: ["label-candidate"], avgLength: 8 },
          ...columns,
        }),
      ],
    ),
  );
  const found = proposal.resources.find(
    (candidate) => candidate.relation === "shop.orders",
  );
  expect(found, "shop.orders").to.not.equal(undefined);
  return found!;
}

function fieldOf(resource: ProposedResource, column: string): ProposedField {
  const found = resource.fields.find((field) => field.column === column);
  expect(found, column).to.not.equal(undefined);
  return found!;
}

function badgeOf(field: ProposedField): BadgeItem[] {
  const display: ColumnDisplay | undefined = field.display?.value;
  expect(display?.kind, `${field.column} display`).to.equal("badge");
  return display?.kind === "badge" ? display.items : [];
}

const STATUS = Column("status", "string");

function badgesEnumLikeStrings(): void {
  it("makes a string column whose categories cover every row a badge, one item per value by rows, toned by its word (D1)", () => {
    const orders = propose([STATUS], {
      status: {
        traits: ENUM,
        categories: { pending: 250, paid: 600, cancelled: 50, shipped: 100 },
      },
    });
    const status = fieldOf(orders, "status");
    expect(status.display?.rule).to.equal("D1");
    expect(status.display?.kind).to.equal("default");
    expect(badgeOf(status)).to.deep.equal([
      { value: "paid", label: "Paid", tone: "success" },
      { value: "pending", label: "Pending", tone: "warning" },
      { value: "shipped", label: "Shipped", tone: "success" },
      { value: "cancelled", label: "Cancelled", tone: "error" },
    ]);
  });

  it("humanizes a value into its label and keeps the value as the database holds it", () => {
    const orders = propose([STATUS], {
      status: {
        traits: ENUM,
        categories: { in_progress: 600, new: 400 },
      },
    });
    expect(badgeOf(fieldOf(orders, "status"))).to.deep.equal([
      { value: "in_progress", label: "In progress", tone: "primary" },
      { value: "new", label: "New", tone: "info" },
    ]);
  });

  it("keeps an upper-case code as its own label", () => {
    const orders = propose([Column("country", "string")], {
      country: { traits: ENUM, categories: { NL: 600, US: 400 } },
    });
    expect(
      badgeOf(fieldOf(orders, "country")).map((item) => item.label),
    ).to.deep.equal(["NL", "US"]);
  });

  it("cycles primary, secondary, info and neutral over the values no word tones, in category order", () => {
    const orders = propose([Column("tier", "string")], {
      tier: {
        traits: ENUM,
        categories: {
          gold: 300,
          silver: 250,
          bronze: 200,
          copper: 150,
          tin: 100,
        },
      },
    });
    expect(
      badgeOf(fieldOf(orders, "tier")).map((item) => item.tone),
    ).to.deep.equal(["primary", "secondary", "info", "neutral", "primary"]);
  });

  it("counts nulls as covered: categories plus nulls make the rows", () => {
    const orders = propose([STATUS], {
      status: {
        traits: ENUM,
        nulls: 100,
        categories: { paid: 600, pending: 300 },
      },
    });
    expect(fieldOf(orders, "status").display?.value.kind).to.equal("badge");
  });

  it("shows no badge when a value is missing from the categories, as a value counted too rarely is dropped (D1)", () => {
    const orders = propose([STATUS], {
      status: {
        traits: ENUM,
        categories: { paid: 600, pending: 390 },
      },
    });
    expect(fieldOf(orders, "status").display).to.equal(undefined);
  });

  it("shows no badge for one category, nor for more than ten", () => {
    const eleven = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [`value_${index}`, 90]),
    );
    const orders = propose([STATUS, Column("kind", "string")], {
      status: { traits: ENUM, categories: { paid: 1000 } },
      kind: { traits: ENUM, categories: { ...eleven, value_11: 10 } },
    });
    expect(fieldOf(orders, "status").display).to.equal(undefined);
    expect(fieldOf(orders, "kind").display).to.equal(undefined);
  });

  it("shows no badge on a column the profile did not call enum-like, nor on one declared a number", () => {
    const orders = propose([STATUS, Column("level", "number")], {
      status: { categories: { paid: 600, pending: 400 } },
      level: { traits: ENUM, categories: { "1": 600, "2": 400 } },
    });
    expect(fieldOf(orders, "status").display).to.equal(undefined);
    expect(fieldOf(orders, "level").display).to.equal(undefined);
  });
}

function pricesMoneyColumns(): void {
  it("makes a number column named like money a price, whatever the spelling (D2)", () => {
    const names = [
      "total",
      "amount",
      "price",
      "cost",
      "revenue",
      "subtotal",
      "unit_price",
      "unitPrice",
      "total_amount",
      "order_total",
    ];
    const orders = propose(
      names.map((name) => Column(name, "number")),
      {},
    );
    for (const name of names) {
      const display = fieldOf(orders, name).display;
      expect(display?.value, name).to.deep.equal({ kind: "price" });
      expect(display?.rule, name).to.equal("D2");
    }
  });

  it("gives a price the currency its comment states, and none when the comment names two", () => {
    const orders = propose(
      [
        Column("total", "number", { comment: "Total (USD)" }),
        Column("total_amount", "number", { comment: "Amount in EUR or USD" }),
        Column("subtotal", "number", { comment: "Before tax" }),
      ],
      {},
    );
    expect(fieldOf(orders, "total").display?.value).to.deep.equal({
      kind: "price",
      currency: "USD",
    });
    expect(fieldOf(orders, "total_amount").display?.value).to.deep.equal({
      kind: "price",
    });
    expect(fieldOf(orders, "subtotal").display?.value).to.deep.equal({
      kind: "price",
    });
  });

  it("gives a price the one currency a sibling currency column holds in every row", () => {
    const orders = propose(
      [Column("total", "number"), Column("currency", "string")],
      {
        currency: { traits: ENUM, categories: { GBP: 1000 } },
      },
    );
    expect(fieldOf(orders, "total").display?.value).to.deep.equal({
      kind: "price",
      currency: "GBP",
    });
  });

  it("leaves a price in the default currency when its currency column holds several, or is partly empty", () => {
    const mixed = propose(
      [Column("total", "number"), Column("currency", "string")],
      {
        currency: { traits: ENUM, categories: { GBP: 600, USD: 400 } },
      },
    );
    expect(fieldOf(mixed, "total").display?.value).to.deep.equal({
      kind: "price",
    });
    const partial = propose(
      [Column("total", "number"), Column("currency", "string")],
      {
        currency: { traits: ENUM, categories: { GBP: 700 } },
      },
    );
    expect(fieldOf(partial, "total").display?.value).to.deep.equal({
      kind: "price",
    });
  });

  it("leaves a number column that only starts with a money word, and a string named like money, plain (D2)", () => {
    const orders = propose(
      [
        Column("total_items", "number"),
        Column("price_id", "number"),
        Column("quantity", "number"),
        Column("price", "string"),
      ],
      {},
    );
    for (const name of ["total_items", "price_id", "quantity", "price"]) {
      expect(fieldOf(orders, name).display, name).to.equal(undefined);
    }
  });
}

function labelsRelationColumns(): void {
  it("labels a relation column with the target's title in singular, not the column's name (D3)", () => {
    const orders = propose([], {});
    const customer = fieldOf(orders, "customer_id");
    expect(customer.relation?.value).to.equal("shop.customers");
    expect(customer.label.value).to.equal("Customer");
    expect(customer.label.rule).to.equal("D3");
  });

  it("keeps the label of a relation column the database commented", () => {
    const orders = propose([], {});
    expect(fieldOf(orders, "customer_id").label.rule).to.equal("D3");
    const commented = proposeMapping(
      Input(
        [
          CUSTOMERS,
          Relation({
            relation: "shop.orders",
            key: ["id"],
            columns: [
              Column("id", "string", { nullable: false }),
              Column("reference", "string"),
              Column("customer_id", "string", { comment: "Buyer" }),
            ],
            references: [ORDERS_CUSTOMER],
          }),
        ],
        [
          Profiled("shop.orders", 1000, {
            reference: { traits: ["label-candidate"], avgLength: 8 },
          }),
        ],
      ),
    );
    const found = commented.resources.find(
      (candidate) => candidate.relation === "shop.orders",
    )!;
    expect(fieldOf(found, "customer_id").label.value).to.equal("Buyer");
  });
}

describe("the display of a column (D1, D2, D3)", () => {
  badgesEnumLikeStrings();
  pricesMoneyColumns();
  labelsRelationColumns();
});

describe("the tabs of a TableView (T1)", () => {
  const CHANNEL = Column("channel", "string");

  it("tabs the status column of two to six values", () => {
    const orders = propose([STATUS, CHANNEL], {
      status: {
        traits: ENUM,
        categories: { paid: 600, pending: 250, cancelled: 150 },
      },
      channel: { traits: ENUM, categories: { web: 700, shop: 300 } },
    });
    expect(orders.tabs?.value).to.deep.equal({ column: "status" });
    expect(orders.tabs?.rule).to.equal("T1");
  });

  it("tabs the column with the fewest values when no name says status", () => {
    const orders = propose([Column("region", "string"), CHANNEL], {
      region: {
        traits: ENUM,
        categories: { north: 400, south: 300, east: 200, west: 100 },
      },
      channel: { traits: ENUM, categories: { web: 700, shop: 300 } },
    });
    expect(orders.tabs?.value).to.deep.equal({ column: "channel" });
  });

  it("does not tab a column of seven values, which badges but is too wide for a strip", () => {
    const seven = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`stage_${index}`, 100]),
    );
    const orders = propose([STATUS], {
      status: { traits: ENUM, categories: { ...seven, stage_7: 300 } },
    });
    expect(fieldOf(orders, "status").display?.value.kind).to.equal("badge");
    expect(orders.tabs).to.equal(undefined);
  });

  it("does not tab a relation that gets no TableView", () => {
    const proposal = proposeMapping(
      Input(
        [
          Relation({
            relation: "shop.events",
            columns: [Column("status", "string"), Column("at", "date")],
          }),
        ],
        [
          Profiled("shop.events", 1000, {
            status: { traits: ENUM, categories: { ok: 600, failed: 400 } },
            at: { traits: ["time-axis"] },
          }),
        ],
      ),
    );
    const events = proposal.resources.find(
      (candidate) => candidate.relation === "shop.events",
    )!;
    expect(events.tableView.value).to.equal(false);
    expect(events.tabs).to.equal(undefined);
  });
});
