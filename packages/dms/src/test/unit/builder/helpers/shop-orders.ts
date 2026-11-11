import { expect } from "chai";
import type {
  ColumnDisplay,
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import {
  ConfigureBlock,
  ListPages,
  MapResources,
} from "../../../../implementations/dms-builder";
import { expectOk } from "../harness";
import { MODULE } from "../mapped-database";
import { fileText } from "./file-text";

export function Column(
  name: string,
  declared: string,
  extra: Partial<ColumnDescription> = {},
): ColumnDescription {
  return {
    name,
    native: declared,
    nullable: true,
    hasDefault: false,
    generated: false,
    identity: null,
    accepts: [{ declared }],
    comment: null,
    ...extra,
  };
}

export function Relation(
  name: string,
  columns: ColumnDescription[],
  references: RelationDescription["references"] = [],
): RelationDescription {
  return {
    schema: "shop",
    name,
    kind: "table",
    key: { columns: ["id"], source: "primary" },
    writes: { insert: true, update: true, delete: true },
    estimatedRows: null,
    estimate: null,
    comment: null,
    columns,
    indexes: [],
    references,
    referencedBy: [],
  };
}

export const SHOP: RelationDescription[] = [
  Relation("customers", [
    Column("id", "string", { nullable: false }),
    Column("name", "string"),
  ]),
  Relation(
    "orders",
    [
      Column("id", "string", { nullable: false }),
      Column("reference", "string"),
      Column("customer_id", "string"),
      Column("status", "string"),
      Column("total", "number"),
    ],
    [
      {
        name: "orders_customer_id_fkey",
        from: { relation: "shop.orders", columns: ["customer_id"] },
        to: { relation: "shop.customers", columns: ["id"] },
      },
    ],
  ),
];

export const STATUS: ColumnDisplay = {
  kind: "badge",
  items: [
    { value: "paid", label: "Paid", tone: "success" },
    { value: "pending", label: "Pending", tone: "warning" },
    { value: "cancelled", label: "Cancelled", tone: "error" },
  ],
};

export const FIELDS: MappedField[] = [
  { column: "reference" },
  { column: "customer_id", relation: "shop.customers", label: "Customer" },
  { column: "status", filterable: true, display: STATUS },
  { column: "total", display: { kind: "price" } },
];

export function ordersInput(
  overrides: Partial<MappedResource> = {},
): MapResourcesInput {
  return {
    module: MODULE,
    connection: "shop",
    resources: [
      {
        relation: "shop.customers",
        label: "name",
        tableView: true,
        writable: false,
        fields: [{ column: "name" }],
      },
      {
        relation: "shop.orders",
        label: "reference",
        tableView: true,
        writable: false,
        fields: FIELDS,
        tabs: { column: "status" },
        ...overrides,
      },
    ],
  };
}

export async function pageText(): Promise<string> {
  const page = (await ListPages()).find((entry) => entry.id === "shop-orders");
  expect(page, "the orders page").to.not.equal(undefined);
  return fileText(page!.filepath);
}

/** What the workspace sends to map a relation again from what `GetMapping` read back. */
export async function handEditedTabs(): Promise<void> {
  expectOk(await MapResources(ordersInput()), "MapResources");
  const page = (await ListPages()).find((entry) => entry.id === "shop-orders");
  expectOk(
    await ConfigureBlock(`${page!.ref}#table`, {
      tabs: [
        { id: "all", label: "Everything" },
        {
          id: "late",
          label: "Late",
          filter: { accessorKey: "status", value: "pending", mode: "is" },
        },
      ],
    }),
    "ConfigureBlock",
  );
}
