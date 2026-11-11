import type {
  ReferenceCheck,
  RelationDescription,
  RelationSummary,
} from "@antelopejs/interface-database-catalog";
import type {
  MappingProposal,
  OpenItem,
  ProposalDatabase,
  ProposedExclusion,
  ProposedResource,
} from "@antelopejs/interface-dms-builder";
import {
  type ReferenceTarget,
  proposeFields,
  referenceTarget,
} from "./analysis-fields";
import {
  type AnalysisInput,
  type RelationFacts,
  factsOf,
  profiledRowsOf,
  relationName,
} from "./analysis-input";
import { proposeTabs } from "./column-display";
import { impliedTargetNames, titleOf } from "./analysis-names";
import {
  type ProposedVerdict,
  type RelationVerdict,
  classifyRelation,
} from "./analysis-relations";

const FULL_CONTAINMENT = 1;

function singleKey(description: RelationDescription): string | undefined {
  const columns = description.key?.columns ?? [];
  return columns.length === 1 ? columns[0] : undefined;
}

function declaredOf(
  description: RelationDescription,
  column: string,
): string[] {
  return (
    description.columns
      .find((candidate) => candidate.name === column)
      ?.accepts.map((reading) => reading.declared) ?? []
  );
}

/** The relation a column named like a reference points at, with a key of a compatible type. */
function impliedTarget(
  descriptions: RelationDescription[],
  from: RelationDescription,
  column: string,
): RelationDescription | undefined {
  const declared = declaredOf(from, column);
  const names = impliedTargetNames(column);
  const candidates = descriptions
    .filter((target) => target !== from && names.includes(target.name))
    .sort(
      (left, right) =>
        Number(right.schema === from.schema) -
        Number(left.schema === from.schema),
    );
  return candidates.find((target) => {
    const key = singleKey(target);
    return (
      key !== undefined &&
      declaredOf(target, key).some((reading) => declared.includes(reading))
    );
  });
}

/**
 * The references F5 checks: a column named like one that no foreign key declares, against the key
 * of the relation its name points at.
 */
export function impliedReferenceChecks(
  descriptions: RelationDescription[],
): ReferenceCheck[] {
  return descriptions.flatMap((from) => {
    const referring = new Set(
      from.references.flatMap((reference) => reference.from.columns),
    );
    const keyColumns = new Set(from.key?.columns ?? []);
    return from.columns
      .filter((column) => !referring.has(column.name))
      .filter((column) => !keyColumns.has(column.name))
      .flatMap((column) => {
        const target = impliedTarget(descriptions, from, column.name);
        return target
          ? [
              {
                from: { relation: relationName(from), column: column.name },
                to: {
                  relation: relationName(target),
                  column: singleKey(target)!,
                },
              },
            ]
          : [];
      });
  });
}

/** Relations others point at, by a declared foreign key or a reference found whole. */
function referencedRelations(
  input: AnalysisInput,
  facts: RelationFacts[],
): Set<string> {
  const declared = facts
    .filter((relation) => relation.description.referencedBy.length > 0)
    .map((relation) => relation.relation);
  const implied = input.references
    .filter(
      (reference) =>
        reference.match.status === "ok" &&
        reference.match.value.containment >= FULL_CONTAINMENT,
    )
    .map((reference) => reference.to.relation);
  return new Set([...declared, ...implied]);
}

interface Classified {
  facts: RelationFacts;
  verdict: RelationVerdict;
}

function targetsOf(
  input: AnalysisInput,
  classified: Classified[],
): Map<string, ReferenceTarget> {
  const targets = new Map(Object.entries(input.mapped));
  for (const { facts, verdict } of classified) {
    if (verdict.kind === "proposed") {
      targets.set(
        facts.relation,
        referenceTarget(facts.description, verdict.tableView.value),
      );
    }
  }
  return targets;
}

interface ProposedRelation {
  resource: ProposedResource;
  open: OpenItem[];
}

function proposedResource(
  input: AnalysisInput,
  facts: RelationFacts,
  verdict: ProposedVerdict,
  targets: Map<string, ReferenceTarget>,
): ProposedRelation {
  const fields = proposeFields(facts, {
    label: verdict.label.value,
    targets,
    implied: input.references,
  });
  const { description } = facts;
  const resource: ProposedResource = {
    relation: facts.relation,
    tableView: verdict.tableView,
    writable: { value: false, rule: "W1", kind: "default" },
    label: verdict.label,
    title: {
      value: titleOf(description.comment, description.name),
      rule: "L2",
      kind: "default",
    },
    fields: fields.fields,
    leftOut: fields.leftOut,
    writes: description.writes,
  };
  const tabs = verdict.tableView.value
    ? proposeTabs(
        fields.fields.map((field) => ({
          column: field.column,
          display: field.display?.value,
          filterable: field.filterable.value,
        })),
      )
    : undefined;
  if (tabs) {
    resource.tabs = { value: tabs, rule: "T1", kind: "default" };
  }
  if (facts.rows !== null) {
    resource.rows = facts.rows;
  }
  const profiledRows = profiledRowsOf(facts);
  if (profiledRows !== undefined) {
    resource.profiledRows = profiledRows;
  }
  return { resource, open: [...verdict.open, ...fields.open] };
}

/**
 * A purpose question carries the relation as it would be mapped, and the questions that mapping
 * leaves open, should the answer be to map it.
 */
function withResource(
  input: AnalysisInput,
  facts: RelationFacts,
  item: OpenItem,
  targets: Map<string, ReferenceTarget>,
): OpenItem {
  const key = facts.description.key?.columns ?? [];
  const verdict: ProposedVerdict = {
    kind: "proposed",
    tableView: { value: true, rule: "R9", kind: "default" },
    label: {
      value: key.length === 1 ? key[0] : null,
      rule: "R9",
      kind: "default",
    },
    open: [],
  };
  const proposed = proposedResource(input, facts, verdict, targets);
  return proposed.open.length > 0
    ? { ...item, resource: proposed.resource, open: proposed.open }
    : { ...item, resource: proposed.resource };
}

function unmappedExclusions(summaries: RelationSummary[]): ProposedExclusion[] {
  return summaries
    .filter((summary) => summary.unmappable !== undefined)
    .map((summary) => ({
      relation: relationName(summary),
      reason: summary.unmappable ?? "",
      rule: "R1",
    }));
}

function databaseOf(
  input: AnalysisInput,
  resources: ProposedResource[],
): ProposalDatabase {
  const writable = resources.filter(
    (resource) =>
      resource.writes.insert ||
      resource.writes.update ||
      resource.writes.delete,
  ).length;
  const writes =
    writable === 0 ? "none" : writable === resources.length ? "all" : "some";
  return {
    engine: `${input.info.engine} ${input.info.version}`,
    role: input.info.role,
    writes,
  };
}

/**
 * The mapping the rules propose for a connection's relations: each relation a TableView, stats
 * only, excluded, or a question, and each choice with its rule. It writes nothing.
 */
export function proposeMapping(input: AnalysisInput): MappingProposal {
  const facts = factsOf(input);
  const context = { referenced: referencedRelations(input, facts) };
  const classified = facts.map((relation) => ({
    facts: relation,
    verdict: classifyRelation(relation, context),
  }));
  const targets = targetsOf(input, classified);
  const resources: ProposedResource[] = [];
  const excluded = unmappedExclusions(input.summaries);
  const open: OpenItem[] = [];
  for (const { facts: relation, verdict } of classified) {
    if (verdict.kind === "excluded") {
      excluded.push(verdict.exclusion);
    } else if (verdict.kind === "open") {
      open.push(withResource(input, relation, verdict.item, targets));
    } else {
      const proposed = proposedResource(input, relation, verdict, targets);
      resources.push(proposed.resource);
      open.push(...proposed.open);
    }
  }
  return {
    connection: input.connection,
    module: input.module,
    database: databaseOf(input, resources),
    resources,
    excluded,
    open,
  };
}
