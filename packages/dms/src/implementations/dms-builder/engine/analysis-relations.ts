import type { ColumnDescription } from "@antelopejs/interface-database-catalog";
import type {
  OpenItem,
  Proposed,
  ProposedExclusion,
  ProposedKind,
} from "@antelopejs/interface-dms-builder";
import { type RelationFacts, hasTrait } from "./analysis-input";
import {
  isHumanLabelName,
  isSecretColumn,
  isTechnicalTable,
  preferredLabel,
} from "./analysis-names";

const LINK_TABLE_REFERENCES = 2;
const LINK_TABLE_OTHER_COLUMNS = 1;

/** What the rules make of a relation: proposed, excluded, or a question. */
export type RelationVerdict =
  | ProposedVerdict
  | { kind: "excluded"; exclusion: ProposedExclusion }
  | { kind: "open"; item: OpenItem };

export interface ProposedVerdict {
  kind: "proposed";
  tableView: Proposed<boolean>;
  label: Proposed<string | null>;
  open: OpenItem[];
}

/** What a relation rule needs beyond the relation: which relations others refer to. */
export interface RelationContext {
  referenced: Set<string>;
}

interface RelationRule {
  id: string;
  applies(facts: RelationFacts, context: RelationContext): boolean;
  verdict(facts: RelationFacts, context: RelationContext): RelationVerdict;
}

function excluded(
  facts: RelationFacts,
  rule: string,
  reason: string,
): RelationVerdict {
  return {
    kind: "excluded",
    exclusion: { relation: facts.relation, reason, rule },
  };
}

function statsOnly(rule: string, kind: ProposedKind): RelationVerdict {
  return {
    kind: "proposed",
    tableView: { value: false, rule, kind },
    label: { value: null, rule, kind: "fact" },
    open: [],
  };
}

/** Text columns named like a human name, however much their values repeat. */
function isHumanLabelColumn(column: ColumnDescription): boolean {
  return (
    isHumanLabelName(column.name) &&
    column.accepts.some((reading) => reading.declared === "string")
  );
}

function labelCandidates(facts: RelationFacts): string[] {
  return facts.description.columns
    .filter(
      (column) =>
        isHumanLabelColumn(column) ||
        hasTrait(facts, column.name, "label-candidate"),
    )
    .map((column) => column.name);
}

function hasTimeAxis(facts: RelationFacts): boolean {
  return facts.description.columns.some((column) =>
    hasTrait(facts, column.name, "time-axis"),
  );
}

/** A relation keyed by its two foreign keys, with at most one other column: a link table (R5). */
function isLinkTable(facts: RelationFacts): boolean {
  const { key, references, columns } = facts.description;
  if (!key || references.length !== LINK_TABLE_REFERENCES) {
    return false;
  }
  const referring = new Set(
    references.flatMap((reference) => reference.from.columns),
  );
  const keyIsReferences =
    key.columns.length === referring.size &&
    key.columns.every((column) => referring.has(column));
  const others = columns.filter((column) => !referring.has(column.name));
  return keyIsReferences && others.length <= LINK_TABLE_OTHER_COLUMNS;
}

/** Every column a field reads, the key among them: any of them can name a row. */
function labelItem(facts: RelationFacts, proposed: string | null): OpenItem {
  const key = facts.description.key?.columns ?? [];
  const columns = facts.description.columns.filter(
    (column) => column.accepts.length > 0 && !isSecretColumn(column.name),
  );
  return {
    id: `label:${facts.relation}`,
    kind: "label",
    relation: facts.relation,
    question: `Which column names a row of ${facts.relation}? It is what its list shows first, and what columns of other tables pointing at it show.`,
    options: columns.map((column) => ({
      value: column.name,
      title:
        key.length === 1 && key[0] === column.name
          ? `${column.name} (the key)`
          : column.name,
    })),
    proposed,
  };
}

function purposeItem(facts: RelationFacts): OpenItem {
  return {
    id: `purpose:${facts.relation}`,
    kind: "purpose",
    relation: facts.relation,
    question: `What should ${facts.relation} become? Its names, comments and data do not say what it holds.`,
    options: [
      { value: "tableView", title: "A page to list and edit its rows" },
      { value: "statsOnly", title: "Counted in stats, no page" },
      { value: "excluded", title: "Left out" },
    ],
    proposed: null,
  };
}

/** A TableView labelled by the preferred label candidate (R6, L1). */
function labelledTableView(facts: RelationFacts): RelationVerdict {
  const choice = preferredLabel(labelCandidates(facts))!;
  return {
    kind: "proposed",
    tableView: { value: true, rule: "R6", kind: "default" },
    label: { value: choice.column, rule: "L1", kind: "default" },
    open: choice.tied ? [labelItem(facts, choice.column)] : [],
  };
}

/** A referenced TableView with no label candidate, labelled by its key for now (R7). */
function keyLabelledTableView(facts: RelationFacts): RelationVerdict {
  const key = facts.description.key?.columns ?? [];
  const label = key.length === 1 ? key[0] : null;
  return {
    kind: "proposed",
    tableView: { value: true, rule: "R7", kind: "default" },
    label: { value: label, rule: "R7", kind: "default" },
    open: [labelItem(facts, label)],
  };
}

const hasRows = (facts: RelationFacts) => facts.rows !== 0;
const isKeyed = (facts: RelationFacts) => facts.description.key !== null;

/** R1 to R9, in order: the first that applies decides. */
const RELATION_RULES: readonly RelationRule[] = [
  {
    id: "R1",
    applies: (facts) => facts.description.unmappable !== undefined,
    verdict: (facts) =>
      excluded(facts, "R1", facts.description.unmappable ?? ""),
  },
  {
    id: "R4",
    applies: (facts) => isTechnicalTable(facts.description.name),
    verdict: (facts) =>
      excluded(facts, "R4", "a framework's or a migration tool's table"),
  },
  {
    id: "R3",
    applies: (facts) => !hasRows(facts),
    verdict: (facts) => excluded(facts, "R3", "it has no rows"),
  },
  {
    id: "R2",
    applies: (facts) => !isKeyed(facts),
    verdict: () => statsOnly("R2", "fact"),
  },
  { id: "R5", applies: isLinkTable, verdict: () => statsOnly("R5", "fact") },
  {
    id: "R6",
    applies: (facts) => labelCandidates(facts).length > 0,
    verdict: labelledTableView,
  },
  {
    id: "R7",
    applies: (facts, context) => context.referenced.has(facts.relation),
    verdict: keyLabelledTableView,
  },
  {
    id: "R8",
    applies: hasTimeAxis,
    verdict: () => statsOnly("R8", "default"),
  },
  {
    id: "R9",
    applies: () => true,
    verdict: (facts) => ({ kind: "open", item: purposeItem(facts) }),
  },
];

export function classifyRelation(
  facts: RelationFacts,
  context: RelationContext,
): RelationVerdict {
  const rule = RELATION_RULES.find((candidate) =>
    candidate.applies(facts, context),
  )!;
  return rule.verdict(facts, context);
}
