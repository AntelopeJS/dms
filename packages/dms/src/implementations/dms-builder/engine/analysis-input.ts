import type {
  CatalogInfo,
  ColumnProfile,
  ColumnReference,
  Measure,
  ReferenceMatch,
  RelationDescription,
  RelationProfile,
  RelationSummary,
} from "@antelopejs/interface-database-catalog";
import type { ReferenceTarget } from "./analysis-fields";

/** A reference the database does not declare, checked through the catalog (F5). */
export interface ImpliedReference {
  from: ColumnReference;
  to: ColumnReference;
  match: Measure<ReferenceMatch>;
}

/** Everything an analysis reads, gathered from the catalog before any rule runs. */
export interface AnalysisInput {
  connection: string;
  module: string;
  info: CatalogInfo;
  summaries: RelationSummary[];
  descriptions: RelationDescription[];
  profiles: RelationProfile[];
  references: ImpliedReference[];
  /** Relations the module has mapped already, which relation columns may point at. */
  mapped: Record<string, ReferenceTarget>;
}

/** One relation with what the rules read about it. */
export interface RelationFacts {
  relation: string;
  description: RelationDescription;
  profile?: RelationProfile;
  rows: number | null;
}

export function relationName(relation: RelationSummary): string {
  return `${relation.schema}.${relation.name}`;
}

export function columnProfile(
  facts: RelationFacts,
  column: string,
): ColumnProfile | undefined {
  return facts.profile?.columns.find((profile) => profile.name === column);
}

export function hasTrait(
  facts: RelationFacts,
  column: string,
  trait: ColumnProfile["traits"][number],
): boolean {
  return columnProfile(facts, column)?.traits.includes(trait) ?? false;
}

/** The relation's rows, counted by its profile when it has one, estimated otherwise. */
function rowsOf(
  summary: RelationSummary,
  profile: RelationProfile | undefined,
): number | null {
  const counted = profile?.rows;
  return counted?.status === "ok" ? counted.value.rows : summary.estimatedRows;
}

/**
 * The rows the relation's column profiles were measured on: the sample's, when the profile
 * sampled the relation, else its rows.
 */
export function profiledRowsOf(facts: RelationFacts): number | undefined {
  const counted = facts.profile?.rows;
  return (
    facts.profile?.sample?.rows ??
    (counted?.status === "ok" ? counted.value.rows : undefined)
  );
}

export function factsOf(input: AnalysisInput): RelationFacts[] {
  return input.descriptions.map((description) => {
    const relation = relationName(description);
    const profile = input.profiles.find(
      (candidate) => candidate.relation === relation,
    );
    return {
      relation,
      description,
      profile,
      rows: rowsOf(description, profile),
    };
  });
}
