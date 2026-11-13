import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type { MapResourcesInput } from "@antelopejs/interface-dms-builder";
import type { CatalogConnection } from "../../../implementations/dms-builder/engine";
import type { ConnectionAccessConfig } from "./harness";

export const OP_TIMEOUT = 120_000;
export const MODULE = "erp-tables";

/** The project lets the DMS write to `erp`, as the specs that map writable relations need. */
export const ERP_WRITES: ConnectionAccessConfig = { erp: "read-write" };
const SALES = "sales";

const WRITES = { insert: true, update: true, delete: true };

function Column(
  name: string,
  native: string,
  accepts: string[],
  extra: Partial<ColumnDescription> = {},
): ColumnDescription {
  return {
    name,
    native,
    nullable: true,
    hasDefault: false,
    generated: false,
    identity: null,
    accepts: accepts.map((declared) => ({ declared })),
    comment: null,
    ...extra,
  };
}

type RelationSpec = Pick<
  RelationDescription,
  "schema" | "name" | "kind" | "writes" | "columns" | "references"
> & { key: { columns: string[] } | null };

/** A relation as the catalog describes it, with what these specs do not read left empty. */
function Relation(spec: RelationSpec): RelationDescription {
  return {
    ...spec,
    key: spec.key && { columns: spec.key.columns, source: "primary" },
    estimatedRows: null,
    estimate: null,
    comment: null,
    indexes: [],
    referencedBy: [],
  };
}

/** What the postgres catalog answers for the relations the specs map. */
export const DESCRIPTIONS: RelationDescription[] = [
  Relation({
    schema: SALES,
    name: "accounts",
    kind: "table",
    key: { columns: ["id"] },
    writes: WRITES,
    columns: [
      Column("id", "bigint", ["number", "string"], {
        nullable: false,
        hasDefault: true,
        readOnly: "an identity column GENERATED ALWAYS",
      }),
      Column("name", "character varying(200)", ["string"], { nullable: false }),
      Column("status", "sales.status", ["string"], {
        nullable: false,
        hasDefault: true,
      }),
      Column("revenue", "numeric(12,2)", ["number", "string"]),
      Column("created_at", "timestamp with time zone", ["date"], {
        hasDefault: true,
      }),
      Column("Order Date", "date", ["date"]),
      Column("meta", "jsonb", ["object"]),
    ],
    references: [],
  }),
  Relation({
    schema: SALES,
    name: "contacts",
    kind: "table",
    key: { columns: ["contact_id"] },
    writes: WRITES,
    columns: [
      Column("contact_id", "uuid", ["string"], { nullable: false }),
      Column("account_id", "bigint", ["number", "string"]),
      Column("first_name", "text", ["string"], { nullable: false }),
    ],
    references: [
      {
        name: "contacts_account_id_fkey",
        from: { relation: "sales.contacts", columns: ["account_id"] },
        to: { relation: "sales.accounts", columns: ["id"] },
      },
    ],
  }),
  Relation({
    schema: SALES,
    name: "products",
    kind: "table",
    key: { columns: ["id"] },
    writes: WRITES,
    columns: [
      Column("id", "integer", ["number", "string"], { nullable: false }),
      Column("label", "text", ["string"]),
      Column("count", "integer", ["number", "string"]),
    ],
    references: [],
  }),
  Relation({
    schema: SALES,
    name: "countries",
    kind: "table",
    key: { columns: ["code"] },
    writes: WRITES,
    columns: [
      Column("code", "character(2)", ["string"], { nullable: false }),
      Column("name", "text", ["string"]),
    ],
    references: [],
  }),
  Relation({
    schema: SALES,
    name: "raw_log",
    kind: "table",
    key: null,
    writes: WRITES,
    columns: [
      Column("at", "timestamp with time zone", ["date"]),
      Column("msg", "text", ["string"]),
    ],
    references: [],
  }),
];

/** The builder's catalog connection, answering the descriptions above. */
export const FAKE_CATALOG: Partial<CatalogConnection> = {
  async ListRelations() {
    return DESCRIPTIONS;
  },
  async DescribeRelations(relations: string[]) {
    return relations.map((relation) => {
      const found = DESCRIPTIONS.find(
        (description) =>
          `${description.schema}.${description.name}` === relation,
      );
      if (!found) {
        throw new Error(`No relation ${relation}`);
      }
      return found;
    });
  },
};

export const INPUT: MapResourcesInput = {
  module: MODULE,
  connection: "erp",
  resources: [
    {
      relation: "sales.accounts",
      label: "name",
      tableView: true,
      writable: true,
      fields: [
        { column: "name", searchable: true, sortable: true },
        { column: "status", filterable: true },
        { column: "revenue", listable: false },
        { column: "created_at", sortable: true },
        { column: "Order Date" },
        { column: "meta" },
      ],
    },
    {
      relation: "sales.contacts",
      label: "first_name",
      tableView: true,
      writable: false,
      fields: [
        { column: "first_name" },
        { column: "account_id", relation: "sales.accounts", label: "Account" },
      ],
    },
    {
      relation: "sales.products",
      label: "label",
      tableView: true,
      writable: true,
      fields: [{ column: "label" }, { column: "count" }],
    },
    {
      relation: "sales.countries",
      label: "name",
      tableView: true,
      writable: true,
      fields: [{ column: "name" }],
    },
    {
      relation: "sales.raw_log",
      tableView: true,
      writable: false,
      fields: [{ column: "at" }, { column: "msg" }],
    },
  ],
};
