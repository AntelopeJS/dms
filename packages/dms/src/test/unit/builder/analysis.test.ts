import { expect } from "chai";
import type {
  MappingProposal,
  ProposedResource,
} from "@antelopejs/interface-dms-builder";
import {
  impliedReferenceChecks,
  proposeMapping,
} from "../../../implementations/dms-builder/engine";
import {
  Column,
  Input,
  Profiled,
  Reference,
  Relation,
} from "./analysis-catalog";

const ORDERS_CUSTOMER = Reference(
  "erp.orders",
  "customer_code",
  "erp.customers",
  "code",
);

const CUSTOMERS = Relation({
  relation: "erp.customers",
  key: ["code"],
  comment: "Customers. Every account billed.",
  columns: [
    Column("code", "string", { nullable: false }),
    Column("name", "string", { comment: "Display name" }),
    Column("email", "string"),
    Column("segment", "string"),
    Column("password_hash", "string"),
    Column("created_at", "date"),
  ],
  referencedBy: [ORDERS_CUSTOMER],
});

const ORDERS = Relation({
  relation: "erp.orders",
  key: ["id"],
  columns: [
    Column("id", "string", { nullable: false }),
    Column("customer_code", "string"),
    Column("status", "string"),
    Column("ordered_at", "date"),
    Column("total", "number", {
      accepts: [{ declared: "number" }, { declared: "string" }],
    }),
    Column("notes", "string"),
    Column("payload", "object"),
    Column("blob", "bytea", { accepts: [], unsupported: "bytea is not read" }),
  ],
  references: [ORDERS_CUSTOMER],
});

const PROFILES = [
  Profiled("erp.customers", 120, {
    code: { traits: ["identifier-like"], avgLength: 8 },
    name: { traits: ["label-candidate"], avgLength: 20 },
    email: { traits: ["label-candidate", "identifier-like"], avgLength: 24 },
    segment: { traits: ["enum-like"], avgLength: 6 },
    created_at: { traits: ["time-axis"] },
  }),
  Profiled("erp.orders", 5000, {
    status: { traits: ["enum-like"], avgLength: 6 },
    ordered_at: { traits: ["time-axis"] },
    total: { traits: ["measure"] },
    notes: { avgLength: 400 },
  }),
];

function resource(
  proposal: MappingProposal,
  relation: string,
): ProposedResource {
  const found = proposal.resources.find(
    (candidate) => candidate.relation === relation,
  );
  expect(found, relation).to.not.equal(undefined);
  return found!;
}

function field(resource: ProposedResource, column: string) {
  const found = resource.fields.find(
    (candidate) => candidate.column === column,
  );
  expect(found, column).to.not.equal(undefined);
  return found!;
}

describe("the analysis of a database", () => {
  const proposal = proposeMapping(Input([CUSTOMERS, ORDERS], PROFILES));

  it("proposes a keyed table with rows and a label as a read-only TableView (R6, W1)", () => {
    const customers = resource(proposal, "erp.customers");
    expect(customers.tableView).to.deep.equal({
      value: true,
      rule: "R6",
      kind: "default",
    });
    expect(customers.writable.value).to.equal(false);
  });

  it("prefers a label by name among the candidates, with no question (L1)", () => {
    const customers = resource(proposal, "erp.customers");
    expect(customers.label.value).to.equal("name");
    expect(proposal.open.map((item) => item.id)).to.not.include(
      "label:erp.customers",
    );
  });

  it("titles a page and a column from a short comment, and from the name otherwise (L2)", () => {
    const customers = resource(proposal, "erp.customers");
    expect(customers.title.value).to.equal("Customers");
    expect(field(customers, "name").label.value).to.equal("Display name");
    expect(field(customers, "created_at").label.value).to.equal("Created at");
  });

  it("makes a declared foreign key a relation column onto a TableView (F4)", () => {
    const orders = resource(proposal, "erp.orders");
    expect(field(orders, "customer_code").relation).to.deep.equal({
      value: "erp.customers",
      rule: "F4",
      kind: "fact",
      implied: false,
    });
  });

  it("leaves out a column no declaration reads, and one named like a secret (F1, F2)", () => {
    const orders = resource(proposal, "erp.orders");
    expect(orders.leftOut).to.deep.include({
      column: "blob",
      reason: "bytea is not read",
      rule: "F1",
    });
    const customers = resource(proposal, "erp.customers");
    expect(customers.leftOut.map((entry) => entry.rule)).to.deep.equal(["F2"]);
  });

  it("proposes the first declaration a column accepts (F3)", () => {
    const orders = resource(proposal, "erp.orders");
    expect(field(orders, "total").declared.value).to.equal("number");
    expect(field(orders, "total").accepts).to.deep.equal(["number", "string"]);
    expect(field(orders, "total").profile).to.deep.equal({
      traits: ["measure"],
    });
  });

  it("lists, filters, sorts and searches by what the profile says a column is", () => {
    const orders = resource(proposal, "erp.orders");
    expect(field(orders, "status").filterable.value).to.equal(true);
    expect(field(orders, "ordered_at").sortable.value).to.equal(true);
    expect(field(orders, "notes").listable.value).to.equal(false);
    expect(field(orders, "payload").listable.value).to.equal(false);
    const customers = resource(proposal, "erp.customers");
    expect(field(customers, "name").searchable.value).to.equal(true);
    expect(field(customers, "email").searchable.value).to.equal(true);
    expect(field(customers, "segment").searchable.value).to.equal(false);
  });

  it("answers the connection's engine and role, and that it writes nothing", () => {
    expect(proposal.database).to.deep.equal({
      engine: "postgresql 17.5",
      role: "erp_reader",
      writes: "none",
    });
  });
});

describe("the relation rules of the analysis", () => {
  it("excludes an unmappable relation with the catalog's reason (R1)", () => {
    const people = Relation({
      relation: "erp.people",
      key: ["id"],
      columns: [Column("id", "number")],
      unmappable: "SELECT is granted on some columns only",
    });
    const proposal = proposeMapping(Input([], [], { summaries: [people] }));
    expect(proposal.excluded).to.deep.equal([
      {
        relation: "erp.people",
        reason: "SELECT is granted on some columns only",
        rule: "R1",
      },
    ]);
  });

  it("maps a relation without a key for stats only (R2)", () => {
    const log = Relation({
      relation: "erp.audit_log",
      columns: [Column("at", "date"), Column("message", "string")],
    });
    const proposal = proposeMapping(
      Input(
        [log],
        [Profiled("erp.audit_log", 10, { at: { traits: ["time-axis"] } })],
      ),
    );
    expect(proposal.resources[0].tableView).to.deep.equal({
      value: false,
      rule: "R2",
      kind: "fact",
    });
  });

  it("excludes an empty table, and a framework's table (R3, R4)", () => {
    const empty = Relation({
      relation: "erp.drafts",
      key: ["id"],
      columns: [Column("id", "number"), Column("name", "string")],
    });
    const migrations = Relation({
      relation: "erp.schema_migrations",
      key: ["version"],
      columns: [Column("version", "string")],
    });
    const proposal = proposeMapping(
      Input(
        [empty, migrations],
        [
          Profiled("erp.drafts", 0, { name: { traits: ["label-candidate"] } }),
          Profiled("erp.schema_migrations", 12, {}),
        ],
      ),
    );
    expect(proposal.excluded.map((entry) => entry.rule)).to.have.members([
      "R3",
      "R4",
    ]);
    expect(proposal.resources).to.deep.equal([]);
  });

  it("maps a table keyed by its two foreign keys for stats only (R5)", () => {
    const link = Relation({
      relation: "erp.product_tags",
      key: ["product_id", "tag_id"],
      columns: [Column("product_id", "number"), Column("tag_id", "number")],
      references: [
        Reference("erp.product_tags", "product_id", "erp.products", "id"),
        Reference("erp.product_tags", "tag_id", "erp.tags", "id"),
      ],
    });
    const proposal = proposeMapping(
      Input([link], [Profiled("erp.product_tags", 40, {})]),
    );
    expect(proposal.resources[0].tableView.rule).to.equal("R5");
  });

  appliesTheRulesThatLabelOrAsk();
});

function appliesTheRulesThatLabelOrAsk(): void {
  it("labels a referenced table with no label by its key, and asks (R7)", () => {
    const lines = Relation({
      relation: "erp.lines",
      key: ["line_no"],
      columns: [Column("line_no", "number"), Column("qty", "number")],
      referencedBy: [
        Reference("erp.returns", "line_no", "erp.lines", "line_no"),
      ],
    });
    const proposal = proposeMapping(
      Input(
        [lines],
        [Profiled("erp.lines", 40, { qty: { traits: ["measure"] } })],
      ),
    );
    expect(proposal.resources[0].label).to.deep.equal({
      value: "line_no",
      rule: "R7",
      kind: "default",
    });
    expect(proposal.open.map((item) => item.id)).to.deep.equal([
      "label:erp.lines",
    ]);
  });

  it("offers every column as the label, the key too, and says how many rows there are", () => {
    const lines = Relation({
      relation: "erp.lines",
      key: ["line_no"],
      columns: [
        Column("line_no", "number"),
        Column("qty", "number"),
        Column("password_hash", "string"),
      ],
      referencedBy: [
        Reference("erp.returns", "line_no", "erp.lines", "line_no"),
      ],
    });
    const proposal = proposeMapping(
      Input([lines], [Profiled("erp.lines", 40, {})]),
    );
    expect(proposal.open[0].options).to.deep.equal([
      { value: "line_no", title: "line_no (the key)" },
      { value: "qty", title: "qty" },
    ]);
    expect(proposal.resources[0].rows).to.equal(40);
  });

  it("maps a keyed table with only a time axis for stats only (R8)", () => {
    const events = Relation({
      relation: "erp.events",
      key: ["id"],
      columns: [Column("id", "number"), Column("at", "date")],
    });
    const proposal = proposeMapping(
      Input(
        [events],
        [Profiled("erp.events", 40, { at: { traits: ["time-axis"] } })],
      ),
    );
    expect(proposal.resources[0].tableView).to.deep.equal({
      value: false,
      rule: "R8",
      kind: "default",
    });
  });

  it("asks what a relation holds when no rule decides, and proposes nothing for it (R9)", () => {
    const opaque = Relation({
      relation: "legacy.t_cst",
      key: ["id"],
      columns: [Column("id", "number"), Column("c01", "number")],
    });
    const proposal = proposeMapping(
      Input([opaque], [Profiled("legacy.t_cst", 40, {})]),
    );
    expect(proposal.resources).to.deep.equal([]);
    expect(proposal.open.map((item) => item.id)).to.deep.equal([
      "purpose:legacy.t_cst",
    ]);
    expect(
      proposal.open[0].resource?.fields.map((field) => field.column),
    ).to.deep.equal(["id", "c01"]);
  });

  it("asks when several label candidates tie on name (L1)", () => {
    const parts = Relation({
      relation: "erp.parts",
      key: ["id"],
      columns: [
        Column("id", "number"),
        Column("sku", "string"),
        Column("ean", "string"),
      ],
    });
    const proposal = proposeMapping(
      Input(
        [parts],
        [
          Profiled("erp.parts", 40, {
            sku: { traits: ["label-candidate"] },
            ean: { traits: ["label-candidate"] },
          }),
        ],
      ),
    );
    expect(proposal.resources[0].label.value).to.equal("sku");
    expect(proposal.open.map((item) => item.id)).to.deep.equal([
      "label:erp.parts",
    ]);
  });
}

const invoices = Relation({
  relation: "erp.invoices",
  key: ["id"],
  columns: [
    Column("id", "number"),
    Column("number", "string"),
    Column("order_ref", "string"),
  ],
});
const profiles = [
  Profiled("erp.invoices", 50, { number: { traits: ["label-candidate"] } }),
  ...PROFILES,
];

function analysed(containment: number): MappingProposal {
  return proposeMapping(
    Input([CUSTOMERS, ORDERS, invoices], profiles, {
      references: [
        {
          from: { relation: "erp.invoices", column: "order_ref" },
          to: { relation: "erp.orders", column: "id" },
          match: {
            status: "ok",
            value: {
              containment,
              checkedRows: 50,
              sampled: false,
              targetIsKey: true,
            },
          },
        },
      ],
    }),
  );
}

describe("references the database does not declare", () => {
  it("checks a column named like a reference against the key its name points at", () => {
    expect(impliedReferenceChecks([CUSTOMERS, ORDERS, invoices])).to.deep.equal(
      [
        {
          from: { relation: "erp.invoices", column: "order_ref" },
          to: { relation: "erp.orders", column: "id" },
        },
      ],
    );
  });

  it("makes one found whole a relation column, marked implied (F5)", () => {
    const proposal = analysed(1);
    expect(
      field(resource(proposal, "erp.invoices"), "order_ref").relation,
    ).to.deep.equal({
      value: "erp.orders",
      rule: "F5",
      kind: "default",
      implied: true,
    });
  });

  it("asks about one found almost whole, and keeps it a plain column (F5)", () => {
    const proposal = analysed(0.97);
    expect(
      field(resource(proposal, "erp.invoices"), "order_ref").relation,
    ).to.equal(undefined);
    expect(proposal.open.map((item) => item.id)).to.include(
      "reference:erp.invoices.order_ref",
    );
  });

  it("offers a plain column, the target found, and every TableView whose key fits", () => {
    const item = analysed(0.97).open.find(
      (entry) => entry.id === "reference:erp.invoices.order_ref",
    );
    expect(item?.options).to.deep.equal([
      { value: null, title: "A plain column" },
      { value: "erp.orders", title: "A reference to erp.orders (97% found)" },
      { value: "erp.customers", title: "A reference to erp.customers" },
    ]);
  });

  offersOnlyKeysHoldingTheSameKindOfValue();

  it("ignores one found in part", () => {
    const proposal = analysed(0.5);
    expect(proposal.open.map((item) => item.id)).to.not.include(
      "reference:erp.invoices.order_ref",
    );
  });
});

function offersOnlyKeysHoldingTheSameKindOfValue(): void {
  it("proposes no reference whose key holds another kind of value than the column", () => {
    const uuids = Relation({
      relation: "erp.invoices",
      key: ["id"],
      columns: [
        Column("id", "number"),
        Column("number", "string"),
        Column("order_ref", "string", { native: "uuid" }),
      ],
    });
    const proposal = proposeMapping(
      Input([CUSTOMERS, ORDERS, uuids], profiles, {
        references: [
          {
            from: { relation: "erp.invoices", column: "order_ref" },
            to: { relation: "erp.orders", column: "id" },
            match: {
              status: "ok",
              value: {
                containment: 0.97,
                checkedRows: 50,
                sampled: false,
                targetIsKey: true,
              },
            },
          },
        ],
      }),
    );
    expect(proposal.open.map((entry) => entry.id)).to.not.include(
      "reference:erp.invoices.order_ref",
    );
    expect(
      field(resource(proposal, "erp.invoices"), "order_ref").relation,
    ).to.equal(undefined);
  });

  it("offers among the other TableViews only those whose key holds the column's kind of value", () => {
    const uuidKeyed = Relation({
      relation: "erp.customers",
      key: ["code"],
      columns: [
        Column("code", "string", { native: "uuid", nullable: false }),
        Column("name", "string"),
      ],
    });
    const proposal = proposeMapping(
      Input([uuidKeyed, ORDERS, invoices], profiles, {
        references: [
          {
            from: { relation: "erp.invoices", column: "order_ref" },
            to: { relation: "erp.orders", column: "id" },
            match: {
              status: "ok",
              value: {
                containment: 0.97,
                checkedRows: 50,
                sampled: false,
                targetIsKey: true,
              },
            },
          },
        ],
      }),
    );
    const item = proposal.open.find(
      (entry) => entry.id === "reference:erp.invoices.order_ref",
    );
    expect(item?.options.map((option) => option.value)).to.deep.equal([
      null,
      "erp.orders",
    ]);
  });
}
