import type {
  AnalysisState,
  ProposalDatabase,
  ProposedExclusion,
} from "@antelopejs/interface-dms-builder";
import type {
  RedactedAnalysis,
  RedactedField,
  RedactedOpenItem,
  RedactedProposal,
  RedactedResource,
} from "./redact";
import { groupRelations, type RelationGroup } from "./relation-groups";

/** How a proposed screen shows its table. */
export type ScreenKind = "table" | "status" | "tabs" | "stats";

/** One column of a relation, as much as a screen needs to be drafted from it. */
export interface ColumnSummary {
  column: string;
  /** The column's native type. */
  type: string;
  /** The declaration the proposal reads it as, when it is not the native type. */
  declared?: string;
  /** `"schema.name"` of the relation the column refers to. */
  relation?: string;
  display?: "badge" | "price";
  /** What the profile measured it to be, such as `enum-like` or `time-axis`. */
  traits?: string[];
  /** Where the proposal puts it: `list`, `filter`, `sort`, `search`. */
  on?: string[];
}

/** One relation the proposal maps, without a rule, a profile or a row's value. */
export interface ResourceSummary {
  relation: string;
  title: string;
  screen: ScreenKind;
  /** Its rows, counted or estimated, when either is known. */
  rows?: number;
  writable: boolean;
  /** The column relation columns pointing here show. */
  label: string | null;
  /** The badge column its tabs follow. */
  tabs?: string;
  columns: ColumnSummary[];
  /** The columns the proposal leaves out; `detail` says why. */
  leftOut: string[];
}

/** A question the rules left open, with the titles of its options. */
export interface OpenItemSummary {
  id: string;
  kind: RedactedOpenItem["kind"];
  relation?: string;
  column?: string;
  question: string;
  options: string[];
  /** For a `purpose` item, the rows of the relation it asks about. */
  rows?: number;
}

/** What `detail` named, in full. */
export interface AnalysisDetail {
  resources: RedactedResource[];
  /** The open items of those relations. */
  open: RedactedOpenItem[];
  /** The names that match no relation of the proposal. */
  unknown: string[];
}

/** A finished proposal, compact. */
export interface ProposalSummary {
  connection: string;
  module: string;
  database: ProposalDatabase;
  resources: ResourceSummary[];
  excluded: Array<Pick<ProposedExclusion, "relation" | "reason">>;
  open: OpenItemSummary[];
  /** The relations read that the module maps already, which the proposal leaves out. */
  mapped: string[];
  /**
   * The tables to choose from (resources and `purpose` items), grouped once there are more than
   * the grouping threshold, so the user picks or skips a group at once before refining inside it.
   */
  groups?: RelationGroup[];
  detail?: AnalysisDetail;
  hint: string;
}

/** An analysis job as `builder_analyse_database` answers it by default. */
export type AnalysisSummary = Omit<AnalysisState, "proposal"> & {
  proposal?: ProposalSummary;
};

const HINT =
  'Compact: each relation lists its columns with types, relations and where each is used. Pass `detail: ["schema.name"]` to read the named relations in full: every choice with its rule, each column\'s profile, and the open items of those relations.';

const ALL_MAPPED_HINT =
  "Every relation read is mapped already, so nothing is left to propose: say so, and offer to open the pages that show them, or to start a new mockup over them (mockup_write_spec).";

function groupedHint(tables: number): string {
  return `The proposal holds ${tables} tables, too many to choose one by one: show the user \`groups\` first and let them pick or skip each group whole, then open a picked group to refine its tables, passing them to \`detail\` a few at a time, since a full proposal of this many tables does not fit your context. Use only the tables picked. Each relation below lists its columns with types, relations and where each is used.`;
}

/** The tables a user chooses from: the relations proposed and those a `purpose` item asks about. */
function tablesOf(proposal: RedactedProposal): string[] {
  return [
    ...proposal.resources.map((resource) => resource.relation),
    ...proposal.open.flatMap((item) =>
      item.kind === "purpose" && item.relation !== undefined
        ? [item.relation]
        : [],
    ),
  ];
}

/** The hint for a proposal: what to do when every relation read is mapped already, else how to read more. */
function hintOf(proposal: RedactedProposal): string {
  const nothingLeft =
    proposal.resources.length === 0 && proposal.open.length === 0;
  return nothingLeft && proposal.mapped.length > 0 ? ALL_MAPPED_HINT : HINT;
}

function screenOf(resource: RedactedResource): ScreenKind {
  if (!resource.tableView.value) return "stats";
  if (resource.tabs) return "tabs";
  return resource.fields.some((field) => field.display?.value.kind === "badge")
    ? "status"
    : "table";
}

function usesOf(field: RedactedField): string[] {
  return [
    field.listable.value ? "list" : undefined,
    field.filterable.value ? "filter" : undefined,
    field.sortable.value ? "sort" : undefined,
    field.searchable.value ? "search" : undefined,
  ].filter((use) => use !== undefined);
}

function columnOf(field: RedactedField): ColumnSummary {
  const summary: ColumnSummary = { column: field.column, type: field.native };
  if (field.declared.value !== field.native) {
    summary.declared = field.declared.value;
  }
  if (field.relation) summary.relation = field.relation.value;
  if (field.display) summary.display = field.display.value.kind;
  if (field.profile?.traits.length) summary.traits = field.profile.traits;
  const on = usesOf(field);
  if (on.length) summary.on = on;
  return summary;
}

function resourceOf(resource: RedactedResource): ResourceSummary {
  const summary: ResourceSummary = {
    relation: resource.relation,
    title: resource.title.value,
    screen: screenOf(resource),
    writable: resource.writable.value,
    label: resource.label.value,
    columns: resource.fields.map(columnOf),
    leftOut: resource.leftOut.map((left) => left.column),
  };
  if (resource.rows !== undefined) summary.rows = resource.rows;
  if (resource.tabs) summary.tabs = resource.tabs.value.column;
  return summary;
}

function openItemOf(item: RedactedOpenItem): OpenItemSummary {
  const summary: OpenItemSummary = {
    id: item.id,
    kind: item.kind,
    question: item.question,
    options: item.options.map((option) => option.title),
  };
  if (item.relation !== undefined) summary.relation = item.relation;
  if (item.column !== undefined) summary.column = item.column;
  if (item.resource?.rows !== undefined) summary.rows = item.resource.rows;
  return summary;
}

/** The resources and the questions the proposal holds about the relations `names`. */
function detailOf(
  proposal: RedactedProposal,
  names: readonly string[],
): AnalysisDetail {
  const asked = proposal.open.flatMap((item) =>
    item.kind === "purpose" && item.resource ? [item.resource] : [],
  );
  const known = [...proposal.resources, ...asked];
  const wanted = new Set(names);
  return {
    resources: known.filter((resource) => wanted.has(resource.relation)),
    open: proposal.open.filter(
      (item) => item.relation !== undefined && wanted.has(item.relation),
    ),
    unknown: names.filter(
      (name) => !known.some((resource) => resource.relation === name),
    ),
  };
}

/**
 * An analysis job as `builder_analyse_database` answers it by default: each
 * relation of its proposal as its columns, relations and screen, which is a
 * small fraction of the full proposal. `detail` names relations to answer in
 * full as well.
 */
export function summariseAnalysis(
  state: RedactedAnalysis,
  detail: readonly string[] = [],
): AnalysisSummary {
  const { proposal, ...rest } = state;
  if (!proposal) return rest;
  const tables = tablesOf(proposal);
  const groups = groupRelations(tables);
  const summary: ProposalSummary = {
    connection: proposal.connection,
    module: proposal.module,
    database: proposal.database,
    resources: proposal.resources.map(resourceOf),
    excluded: proposal.excluded.map(({ relation, reason }) => ({
      relation,
      reason,
    })),
    open: proposal.open.map(openItemOf),
    mapped: proposal.mapped,
    hint: groups ? groupedHint(tables.length) : hintOf(proposal),
  };
  if (groups) summary.groups = groups;
  if (detail.length) summary.detail = detailOf(proposal, detail);
  return { ...rest, proposal: summary };
}
