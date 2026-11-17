import type * as Catalog from "@antelopejs/interface-database-catalog";

/** A second catalog provider, distinct from the selected one: one relation, its own engine. */
export const Info: typeof Catalog.Info = async () => ({
  engine: "warehouse-engine",
  version: "1",
  database: "warehouse",
  role: "reader",
});

export const ListRelations: typeof Catalog.ListRelations = async () => [
  {
    schema: "inventory",
    name: "stock",
    kind: "table",
    estimatedRows: 3,
    estimate: "statistics",
    key: { columns: ["id"], source: "primary" },
    writes: { insert: false, update: false, delete: false },
    comment: null,
  },
];

export const DescribeRelations: typeof Catalog.DescribeRelations =
  async () => [];

export const Profile: typeof Catalog.Profile = async () => {
  throw new Error("the warehouse provider profiles nothing");
};

export const CheckReference: typeof Catalog.CheckReference = async () => {
  throw new Error("the warehouse provider checks no reference");
};

export const SampleRows: typeof Catalog.SampleRows = async () => {
  throw new Error("the warehouse provider samples no rows");
};
