import { InterfaceFunction } from "@antelopejs/interface-core";
import type { ColumnDisplay, TabsChoice } from "./mapping";
import type { ResourceRef } from "./resources";
import type { OpResult } from "./results";

/** Whether a proposed choice follows from the catalog alone, or is a judgement to check. */
export type ProposedKind = "fact" | "default";

/** A choice the analysis made, with the rule that made it. */
export interface Proposed<T> {
  value: T;
  /** The rule's id, e.g. `R6`, `L1`, `F5`. */
  rule: string;
  kind: ProposedKind;
}

/** A declaration the analysis chose, and why it does not round-trip when it does not. */
export interface ProposedDeclaration extends Proposed<string> {
  lossy?: string;
}

/** A relation column the analysis chose; `implied` when the database declares no foreign key. */
export interface ProposedRelationColumn extends Proposed<string> {
  implied: boolean;
}

/** The ends of a number, date or enum column. */
export interface ProposedRange {
  min: number | string;
  max: number | string;
}

/** A category of a column with few distinct values, with its rows. */
export interface ProposedCategory {
  value: string | number | boolean;
  rows: number;
}

/** What the column's profile measured, for the person deciding: aggregates, never a row. */
export interface ProposedColumnProfile {
  traits: string[];
  nulls?: number;
  distinct?: number;
  range?: ProposedRange;
  categories?: ProposedCategory[];
}

/** One column of a proposed relation, each aspect with its rule. */
export interface ProposedField {
  column: string;
  /** The column's native type. */
  native: string;
  /** Every declaration the column accepts, the proposed one among them. */
  accepts: string[];
  declared: ProposedDeclaration;
  label: Proposed<string>;
  listable: Proposed<boolean>;
  filterable: Proposed<boolean>;
  sortable: Proposed<boolean>;
  searchable: Proposed<boolean>;
  /** How the column is drawn (D1, D2); absent when it is plain. */
  display?: Proposed<ColumnDisplay>;
  /** `"schema.name"` of the relation this column refers to, when it becomes a relation column. */
  relation?: ProposedRelationColumn;
  profile?: ProposedColumnProfile;
}

/** A column the analysis leaves out, and why. */
export interface ProposedLeftOut {
  column: string;
  reason: string;
  rule: string;
}

/** What the analysis's connection may write to a relation. */
export interface ProposedWrites {
  insert: boolean;
  update: boolean;
  delete: boolean;
}

/** One relation the analysis proposes to map, in the shape `MapResources` takes. */
export interface ProposedResource {
  /** `"schema.name"`. */
  relation: string;
  tableView: Proposed<boolean>;
  writable: Proposed<boolean>;
  /** The column relation columns pointing here show; null when no column is one. */
  label: Proposed<string | null>;
  title: Proposed<string>;
  /** The tabs of its TableView (T1); absent when no column suits them. */
  tabs?: Proposed<TabsChoice>;
  fields: ProposedField[];
  leftOut: ProposedLeftOut[];
  writes: ProposedWrites;
  /** Its rows, counted by the profile or estimated; absent when neither is known. */
  rows?: number;
  /**
   * The rows its column profiles were measured on: the sample's, when the profile sampled the
   * relation, else its rows. A column's `nulls` is out of these.
   */
  profiledRows?: number;
}

/** A relation the analysis does not propose, and why. */
export interface ProposedExclusion {
  relation: string;
  reason: string;
  rule: string;
}

/**
 * The kinds of question the rules leave open. A `field-type` item asks which declaration reads a
 * column whose values have several native types, none covering enough of them: unanswered, the
 * column is left out.
 */
export type OpenItemKind =
  | "schemas"
  | "purpose"
  | "label"
  | "reference"
  | "field-type";

/** One answer an open item offers. */
export interface OpenItemOption {
  value: unknown;
  title: string;
}

/** A question the rules could not decide, with its options. */
export interface OpenItem {
  /** Stable across runs, e.g. `label:erp.customers`. */
  id: string;
  kind: OpenItemKind;
  relation?: string;
  column?: string;
  question: string;
  options: OpenItemOption[];
  /** What the proposal holds meanwhile, if anything. */
  proposed: unknown;
  /** For a `purpose` item, the relation as it would be mapped should the answer be to map it. */
  resource?: ProposedResource;
  /**
   * For a `purpose` item, the questions its `resource` leaves open, to answer should the answer be
   * to map it. Absent when it leaves none.
   */
  open?: OpenItem[];
}

/** The connected database, as the analysis's connection sees it. */
export interface ProposalDatabase {
  engine: string;
  role: string;
  writes: "none" | "some" | "all";
}

/**
 * A mapping of a connection's relations into a module, proposed from the catalog by fixed rules.
 * Every choice names its rule. It writes nothing: settling it and sending it to `MapResources` is
 * the caller's.
 */
export interface MappingProposal {
  connection: string;
  module: string;
  database: ProposalDatabase;
  resources: ProposedResource[];
  excluded: ProposedExclusion[];
  open: OpenItem[];
}

/** Which connection to analyse, for which module, optionally limited to some schemas. */
export interface AnalyseDatabaseInput {
  /** The id of the builder's catalog connection. */
  connection: string;
  /** The module the mapping is for; relations mapped or excluded there are not proposed again. */
  module: string;
  schemas?: string[];
}

/** How far an analysis has come. */
export interface AnalysisProgress {
  relations: number;
  described: number;
  toProfile: number;
  profiled: number;
  /** Measures that did not finish in their time. */
  timeouts: number;
}

export type AnalysisStatus = "running" | "done" | "failed";

/** An analysis job: its progress, then its proposal or its failure. */
export interface AnalysisState {
  id: string;
  connection: string;
  status: AnalysisStatus;
  progress: AnalysisProgress;
  proposal?: MappingProposal;
  error?: string;
}

/**
 * Starts an analysis of a connection's database, and answers its job at once. Profiling is
 * slow, so the proposal comes later through `GetAnalysis`. One job runs per connection; starting
 * another while one runs answers the running one.
 */
export const AnalyseDatabase =
  InterfaceFunction<
    (input: AnalyseDatabaseInput) => Promise<OpResult<AnalysisState>>
  >();

/**
 * An analysis job's progress, then its proposal. A finished job is kept until the next one on
 * its connection, or a restart.
 */
export const GetAnalysis =
  InterfaceFunction<(id: string) => Promise<OpResult<AnalysisState>>>();

/**
 * A relation a module maps, read back from its code as its current choices, in a proposal's shape:
 * every choice cites the rule `mapped`.
 */
export interface MappedRelation {
  ref: ResourceRef;
  resource: ProposedResource;
  /** The columns the module declares; the rest of `resource.fields` are the catalog's others. */
  included: string[];
}

/** The relations a module maps for a connection, as their current choices, to change and map again. */
export const GetMapping =
  InterfaceFunction<
    (connection: string, module: string) => Promise<OpResult<MappedRelation[]>>
  >();
