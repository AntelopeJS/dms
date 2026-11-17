import type {
  CatalogInfo,
  ColumnDescription,
  ColumnProfile,
  ColumnTrait,
  Reference,
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import type { AnalysisInput } from "../../../implementations/dms-builder/engine";

const WRITES = { insert: false, update: false, delete: false };

export const INFO: CatalogInfo = {
  engine: "postgresql",
  version: "17.5",
  database: "erp",
  role: "erp_reader",
};

/** A column as the catalog describes it, read as its first declaration. */
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

export function Reference(
  from: string,
  fromColumn: string,
  to: string,
  toColumn: string,
): Reference {
  return {
    name: `${from}_${fromColumn}_fkey`,
    from: { relation: from, columns: [fromColumn] },
    to: { relation: to, columns: [toColumn] },
  };
}

/** The parts of a relation a spec chooses; the rest is what a plain table answers. */
export interface RelationSpec {
  relation: string;
  key?: string[];
  columns: ColumnDescription[];
  references?: Reference[];
  referencedBy?: Reference[];
  comment?: string;
  unmappable?: string;
  kind?: RelationDescription["kind"];
}

export function Relation(spec: RelationSpec): RelationDescription {
  const [schema, name] = spec.relation.split(".");
  const description: RelationDescription = {
    schema,
    name,
    kind: spec.kind ?? "table",
    estimatedRows: 100,
    estimate: "statistics",
    key: spec.key ? { columns: spec.key, source: "primary" } : null,
    writes: WRITES,
    comment: spec.comment ?? null,
    columns: spec.columns,
    indexes: [],
    references: spec.references ?? [],
    referencedBy: spec.referencedBy ?? [],
  };
  return spec.unmappable
    ? { ...description, unmappable: spec.unmappable }
    : description;
}

/** A column's traits, with a text length, nulls and categories when it has them. */
export interface ColumnTraits {
  traits?: ColumnTrait[];
  avgLength?: number;
  nulls?: number;
  /** The categories by value with their rows, as a profile counts them. */
  categories?: Record<string, number>;
}

function ColumnProfileOf(name: string, traits: ColumnTraits): ColumnProfile {
  const profile: ColumnProfile = { name, traits: traits.traits ?? [] };
  if (traits.avgLength !== undefined) {
    profile.length = {
      status: "ok",
      value: { min: 1, avg: traits.avgLength, max: traits.avgLength },
    };
  }
  if (traits.nulls !== undefined) {
    profile.nulls = { status: "ok", value: traits.nulls };
  }
  if (traits.categories) {
    profile.categories = {
      status: "ok",
      value: {
        values: Object.entries(traits.categories).map(([value, rows]) => ({
          value,
          rows,
        })),
        other: 0,
      },
    };
  }
  return profile;
}

export function Profiled(
  relation: string,
  rows: number,
  columns: Record<string, ColumnTraits>,
): RelationProfile {
  return {
    relation,
    rows: { status: "ok", value: { rows, exact: true } },
    sample: null,
    columns: Object.entries(columns).map(([name, traits]) =>
      ColumnProfileOf(name, traits),
    ),
    references: [],
    inbound: [],
  };
}

export function Input(
  descriptions: RelationDescription[],
  profiles: RelationProfile[],
  extra: Partial<AnalysisInput> = {},
): AnalysisInput {
  return {
    connection: "erp",
    module: "erp-tables",
    info: INFO,
    summaries: descriptions,
    descriptions,
    profiles,
    references: [],
    mapped: {},
    ...extra,
  };
}
