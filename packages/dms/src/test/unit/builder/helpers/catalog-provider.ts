import type * as Catalog from "@antelopejs/interface-database-catalog";

/** What a real catalog provider exports: the six functions, none of the interface's constants. */
export const Info: typeof Catalog.Info = async () => ({
  engine: "spec-engine",
  version: "1",
  database: "spec",
  role: "spec",
});

export const ListRelations: typeof Catalog.ListRelations = async () => [];

export const DescribeRelations: typeof Catalog.DescribeRelations =
  async () => [];

export const Profile: typeof Catalog.Profile = async () => {
  throw new Error("the spec provider profiles nothing");
};

export const CheckReference: typeof Catalog.CheckReference = async () => {
  throw new Error("the spec provider checks no reference");
};

export const SampleRows: typeof Catalog.SampleRows = async () => {
  throw new Error("the spec provider samples no rows");
};
