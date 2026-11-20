import { expect } from "chai";
import type {
  ColumnDescription,
  ColumnTrait,
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import { proposeMapping } from "../../../implementations/dms-builder/engine";
import {
  type AnalysisSummary,
  summariseAnalysis,
} from "../../../mcp/analysis-summary";
import { type RedactedAnalysis, redactAnalysis } from "../../../mcp/redact";
import {
  Column,
  Input,
  Profiled,
  Reference,
  Relation,
} from "./analysis-catalog";

type ColumnSpec = [
  name: string,
  declared: string,
  traits?: ColumnTrait[],
  extra?: Partial<ColumnDescription>,
];

interface TableSpec {
  name: string;
  rows: number;
  columns: ColumnSpec[];
  refers?: Array<[column: string, target: string]>;
  comment?: string;
}

const STATUS = { paid: 60, pending: 25, refunded: 10, void: 5 };
const KINDS = { retail: 40, wholesale: 35, partner: 25 };

const ID: ColumnSpec = [
  "id",
  "string",
  ["identifier-like"],
  { nullable: false },
];
const CREATED: ColumnSpec = ["created_at", "date", ["time-axis"]];

/** A 12-table ERP: customers, orders and what hangs off them. */
const TABLES: TableSpec[] = [
  {
    name: "customers",
    rows: 4800,
    comment: "Customers. Every billed account.",
    columns: [
      ID,
      ["name", "string", ["label-candidate"]],
      ["email", "string", ["label-candidate", "identifier-like"]],
      ["phone", "string"],
      ["segment", "string", ["enum-like"]],
      ["country", "string", ["enum-like"]],
      ["city", "string"],
      ["vat_number", "string", ["identifier-like"]],
      ["password_hash", "string"],
      CREATED,
    ],
  },
  {
    name: "orders",
    rows: 91_000,
    columns: [
      ID,
      ["customer_id", "string"],
      ["status", "string", ["enum-like"]],
      ["currency", "string", ["enum-like"]],
      ["total", "number", ["measure"]],
      ["tax", "number", ["measure"]],
      ["shipping_address", "string"],
      ["notes", "string"],
      ["placed_at", "date", ["time-axis"]],
      ["shipped_at", "date"],
      ["raw_payload", "object"],
    ],
    refers: [["customer_id", "customers"]],
  },
  {
    name: "order_lines",
    rows: 310_000,
    columns: [
      ID,
      ["order_id", "string"],
      ["product_id", "string"],
      ["quantity", "number", ["measure"]],
      ["unit_price", "number", ["measure"]],
      ["discount", "number", ["measure"]],
    ],
    refers: [
      ["order_id", "orders"],
      ["product_id", "products"],
    ],
  },
  {
    name: "products",
    rows: 1200,
    columns: [
      ID,
      ["sku", "string", ["identifier-like"]],
      ["name", "string", ["label-candidate"]],
      ["description", "string"],
      ["category_id", "string"],
      ["price", "number", ["measure"]],
      ["stock", "number", ["measure"]],
      ["active", "boolean"],
      CREATED,
    ],
    refers: [["category_id", "categories"]],
  },
  {
    name: "categories",
    rows: 40,
    columns: [
      ID,
      ["name", "string", ["label-candidate"]],
      ["parent_id", "string"],
    ],
  },
  {
    name: "invoices",
    rows: 88_000,
    columns: [
      ID,
      ["order_id", "string"],
      ["number", "string", ["identifier-like"]],
      ["status", "string", ["enum-like"]],
      ["amount", "number", ["measure"]],
      ["issued_at", "date", ["time-axis"]],
      ["due_at", "date"],
      ["paid_at", "date"],
    ],
    refers: [["order_id", "orders"]],
  },
  {
    name: "payments",
    rows: 84_000,
    columns: [
      ID,
      ["invoice_id", "string"],
      ["method", "string", ["enum-like"]],
      ["amount", "number", ["measure"]],
      ["received_at", "date", ["time-axis"]],
      ["reference", "string"],
    ],
    refers: [["invoice_id", "invoices"]],
  },
  {
    name: "suppliers",
    rows: 310,
    columns: [
      ID,
      ["name", "string", ["label-candidate"]],
      ["contact_email", "string"],
      ["country", "string", ["enum-like"]],
      ["rating", "number", ["measure"]],
      CREATED,
    ],
  },
  {
    name: "shipments",
    rows: 76_000,
    columns: [
      ID,
      ["order_id", "string"],
      ["carrier", "string", ["enum-like"]],
      ["tracking", "string", ["identifier-like"]],
      ["status", "string", ["enum-like"]],
      ["shipped_at", "date", ["time-axis"]],
      ["delivered_at", "date"],
    ],
    refers: [["order_id", "orders"]],
  },
  {
    name: "warehouses",
    rows: 6,
    columns: [
      ID,
      ["name", "string", ["label-candidate"]],
      ["city", "string"],
      ["capacity", "number"],
    ],
  },
  {
    name: "employees",
    rows: 140,
    columns: [
      ID,
      ["name", "string", ["label-candidate"]],
      ["email", "string", ["identifier-like"]],
      ["role", "string", ["enum-like"]],
      ["salary", "number", ["measure"]],
      ["hired_at", "date", ["time-axis"]],
    ],
  },
  {
    name: "audit_log",
    rows: 2_400_000,
    columns: [
      ["at", "date", ["time-axis"]],
      ["actor", "string"],
      ["action", "string", ["enum-like"]],
      ["detail", "string"],
    ],
  },
];

function describeTable(table: TableSpec): RelationDescription {
  const refs = (table.refers ?? []).map(([column, target]) =>
    Reference(`erp.${table.name}`, column, `erp.${target}`, "id"),
  );
  const inbound = TABLES.flatMap((other) =>
    (other.refers ?? [])
      .filter(([, target]) => target === table.name)
      .map(([column]) =>
        Reference(`erp.${other.name}`, column, `erp.${table.name}`, "id"),
      ),
  );
  return Relation({
    relation: `erp.${table.name}`,
    key: table.columns[0][0] === "id" ? ["id"] : undefined,
    comment: table.comment,
    columns: table.columns.map(([name, declared, , extra]) =>
      Column(name, declared, extra),
    ),
    references: refs,
    referencedBy: inbound,
  });
}

function profile(table: TableSpec): RelationProfile {
  return Profiled(
    `erp.${table.name}`,
    table.rows,
    Object.fromEntries(
      table.columns.map(([name, , traits]) => [
        name,
        {
          traits,
          avgLength: 14,
          nulls: 3,
          categories: traits?.includes("enum-like")
            ? name === "segment"
              ? KINDS
              : STATUS
            : undefined,
        },
      ]),
    ),
  );
}

const PROPOSAL = proposeMapping(
  Input(TABLES.map(describeTable), TABLES.map(profile)),
);

const STATE = redactAnalysis({
  id: "job-1",
  connection: "erp",
  status: "done",
  progress: {
    relations: 12,
    described: 12,
    toProfile: 12,
    profiled: 12,
    timeouts: 0,
  },
  proposal: PROPOSAL,
});

function bytes(value: AnalysisSummary | RedactedAnalysis): number {
  return Buffer.byteLength(JSON.stringify(value));
}

describe("[unit] builder_analyse_database: the compact answer", () => {
  const summary = summariseAnalysis(STATE);
  const proposal = summary.proposal;

  it("lists every mapped relation with its screen, rows, columns and relations", () => {
    const orders = proposal?.resources.find(
      (resource) => resource.relation === "erp.orders",
    );

    expect(proposal?.resources.length).to.be.greaterThan(5);
    expect(orders).to.deep.include({
      relation: "erp.orders",
      rows: 91_000,
      writable: false,
    });
    expect(orders?.screen).to.be.oneOf(["table", "status", "tabs"]);
    expect(orders?.columns.map((column) => column.column)).to.include.members([
      "customer_id",
      "status",
      "total",
      "placed_at",
    ]);
    expect(
      orders?.columns.find((column) => column.column === "customer_id")
        ?.relation,
    ).to.equal("erp.customers");
    expect(
      orders?.columns.find((column) => column.column === "total"),
    ).to.deep.include({ type: "number" });
    expect(
      proposal?.resources.find(
        (resource) => resource.relation === "erp.customers",
      )?.leftOut,
    ).to.include("password_hash");
  });

  it("answers the relations the rules excluded and the questions they left", () => {
    expect(proposal?.excluded).to.deep.equal(
      PROPOSAL.excluded.map(({ relation, reason }) => ({ relation, reason })),
    );
    expect(proposal?.open.map((item) => item.id)).to.deep.equal(
      PROPOSAL.open.map((item) => item.id),
    );
  });

  it("carries no rule, no profile and no full resource unless asked", () => {
    const text = JSON.stringify(summary);

    expect(text).to.not.contain('"rule"');
    expect(text).to.not.contain('"profile"');
    expect(proposal?.detail).to.equal(undefined);
    expect(proposal?.hint).to.contain("detail");
  });

  it("tells the agent to offer the existing pages or a new mockup once every relation is mapped", () => {
    const left = (mapped: string[]) =>
      summariseAnalysis(
        redactAnalysis({
          ...STATE,
          proposal: { ...PROPOSAL, resources: [], open: [], mapped },
        }),
      ).proposal;

    const allMapped = left(["erp.customers", "erp.orders"]);
    expect(allMapped?.mapped).to.deep.equal(["erp.customers", "erp.orders"]);
    expect(allMapped?.hint).to.contain("mapped already");
    expect(allMapped?.hint).to.contain("mockup_write_spec");
    expect(left([])?.hint).to.not.contain("mapped already");
    expect(proposal?.hint).to.not.contain("mapped already");
  });

  it("keeps the job's own fields and an answer with no proposal as it was", () => {
    expect(summary).to.deep.include({ id: "job-1", status: "done" });
    const running = summariseAnalysis({
      id: "job-2",
      connection: "erp",
      status: "running",
      progress: {
        relations: 12,
        described: 3,
        toProfile: 0,
        profiled: 0,
        timeouts: 0,
      },
    });

    expect(running).to.not.have.property("proposal");
    expect(running.status).to.equal("running");
  });

  it("is a small part of the full answer, and fits an agent's context", () => {
    const full = bytes(STATE);
    const compact = bytes(summary);

    expect(compact).to.be.lessThan(full / 4);
    expect(compact).to.be.lessThan(16_000);
  });
});

describe("[unit] builder_analyse_database: detail of named relations", () => {
  it("answers the named relations in full, with their rules and profiles", () => {
    const summary = summariseAnalysis(STATE, ["erp.orders"]);
    const detail = summary.proposal?.detail;

    expect(
      detail?.resources.map((resource) => resource.relation),
    ).to.deep.equal(["erp.orders"]);
    const status = detail?.resources[0].fields.find(
      (field) => field.column === "status",
    );
    expect(status?.declared.rule).to.be.a("string");
    expect(status?.profile?.traits).to.include("enum-like");
    expect(summary.proposal?.resources.length).to.equal(
      PROPOSAL.resources.length,
    );
  });

  it("reads a relation the proposal only asks about, and names the ones it does not know", () => {
    const asked = PROPOSAL.open.flatMap((item) =>
      item.kind === "purpose" && item.resource ? [item.resource.relation] : [],
    );
    const detail = summariseAnalysis(STATE, [...asked, "erp.nothing"]).proposal
      ?.detail;

    expect(detail?.unknown).to.deep.equal(["erp.nothing"]);
    expect(
      detail?.resources.map((resource) => resource.relation),
    ).to.have.members(asked);
  });

  it("is still smaller than the full answer for every relation at once", () => {
    const every = summariseAnalysis(
      STATE,
      STATE.proposal?.resources.map((resource) => resource.relation),
    );

    expect(bytes(every)).to.be.greaterThan(bytes(summariseAnalysis(STATE)));
  });
});
