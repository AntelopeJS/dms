import type {
  ColumnProfile,
  ColumnTrait,
  FanOut,
  InboundProfile,
  LengthStats,
  Measure,
  Reference,
  RelationProfile,
  RowCount,
  SampleInfo,
} from "@antelopejs/interface-database-catalog";
import type {
  AnalysisState,
  ColumnDisplay,
  FileChange,
  MappedRelation,
  MapResourcesResult,
  MappingProposal,
  OpenItem,
  OpResult,
  OpWarning,
  Proposed,
  ProposedColumnProfile,
  ProposedField,
  ProposedResource,
  QueryPreview,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";

/** The categories of a few-valued column: how many rows each holds, never the value. */
export interface CategoryCounts {
  rows: number[];
  other: number;
}

/** One column's profile, as the AI reads it: counts, lengths and traits, never a value. */
export interface RedactedColumnProfile {
  name: string;
  nulls?: Measure<number>;
  distinct?: Measure<number>;
  /** How many calendar months hold rows. */
  months?: Measure<number>;
  categories?: Measure<CategoryCounts>;
  length?: Measure<LengthStats>;
  traits: ColumnTrait[];
}

/** A declared foreign key out of the profiled relation, with its fan-out. */
export interface RedactedReferenceProfile {
  reference: Reference;
  fanOut: Measure<FanOut>;
}

/** A relation's profile, as the AI reads it. */
export interface RedactedRelationProfile {
  relation: string;
  rows: Measure<RowCount>;
  sample: SampleInfo | null;
  columns: RedactedColumnProfile[];
  references: RedactedReferenceProfile[];
  inbound: InboundProfile[];
}

/** A display, as the AI reads it: a badge says how many values it draws, a price no currency. */
export type RedactedDisplay =
  | { kind: "badge"; values: number }
  | { kind: "price" };

/** What a field's profile measured, as the AI reads it. */
export interface RedactedFieldProfile {
  traits: string[];
  nulls?: number;
  distinct?: number;
  /** The rows of each category, most first. */
  categories?: number[];
}

/** One proposed column, as the AI reads it. */
export type RedactedField = Omit<ProposedField, "display" | "profile"> & {
  display?: Proposed<RedactedDisplay>;
  profile?: RedactedFieldProfile;
};

/** One proposed relation, as the AI reads it. */
export type RedactedResource = Omit<ProposedResource, "fields"> & {
  fields: RedactedField[];
};

/** An open item, as the AI reads it. */
export type RedactedOpenItem = Omit<OpenItem, "resource" | "open"> & {
  resource?: RedactedResource;
  open?: RedactedOpenItem[];
};

/** A proposal, as the AI reads it. */
export type RedactedProposal = Omit<MappingProposal, "resources" | "open"> & {
  resources: RedactedResource[];
  open: RedactedOpenItem[];
};

/** An analysis job, as the AI reads it. */
export type RedactedAnalysis = Omit<AnalysisState, "proposal"> & {
  proposal?: RedactedProposal;
};

/** A mapped relation, as the AI reads it. */
export type RedactedMappedRelation = Omit<MappedRelation, "resource"> & {
  resource: RedactedResource;
};

/** A changed file, without the diff that would show what was written into it. */
export type RedactedChange = Omit<FileChange, "diff">;

/** What a JSON value is made of: the type of each leaf, the length and element shapes of a list. */
export type JsonTypes =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | { length: number; items: JsonTypes[] }
  | { [key: string]: JsonTypes };

/** A query preview, as the AI reads it: the types its body holds, not its data. */
export type RedactedQueryPreview = Omit<QueryPreview, "body"> & {
  /** `empty`: no rows; `zero`: rows, but every figure is zero or missing. */
  status?: PreviewStatus;
  body: JsonTypes;
};

/** What a preview's answer would render: something, nothing, or only zeros. */
export type PreviewStatus = "ok" | "empty" | "zero";

function measured<T, U>(
  measure: Measure<T>,
  keep: (value: T) => U,
): Measure<U> {
  return measure.status === "ok"
    ? { status: "ok", value: keep(measure.value) }
    : measure;
}

function redactColumn(column: ColumnProfile): RedactedColumnProfile {
  const redacted: RedactedColumnProfile = {
    name: column.name,
    traits: [...column.traits],
  };
  if (column.nulls) redacted.nulls = column.nulls;
  if (column.distinct) redacted.distinct = column.distinct;
  if (column.length) redacted.length = column.length;
  if (column.months) {
    redacted.months = measured(column.months, (months) => months.length);
  }
  if (column.categories) {
    redacted.categories = measured(column.categories, (categories) => ({
      rows: categories.values.map((category) => category.rows),
      other: categories.other,
    }));
  }
  return redacted;
}

/** A relation's profile without its ranges, category values and month labels. */
export function redactProfile(
  profile: RelationProfile,
): RedactedRelationProfile {
  return {
    relation: profile.relation,
    rows: profile.rows,
    sample: profile.sample,
    columns: profile.columns.map(redactColumn),
    references: profile.references.map(({ reference, fanOut }) => ({
      reference,
      fanOut,
    })),
    inbound: profile.inbound.map(({ reference, estimatedRows }) => ({
      reference,
      estimatedRows,
    })),
  };
}

function redactDisplay(display: ColumnDisplay): RedactedDisplay {
  return display.kind === "badge"
    ? { kind: "badge", values: display.items.length }
    : { kind: "price" };
}

function redactFieldProfile(
  profile: ProposedColumnProfile,
): RedactedFieldProfile {
  const redacted: RedactedFieldProfile = { traits: [...profile.traits] };
  if (profile.nulls !== undefined) redacted.nulls = profile.nulls;
  if (profile.distinct !== undefined) redacted.distinct = profile.distinct;
  if (profile.categories) {
    redacted.categories = profile.categories.map((category) => category.rows);
  }
  return redacted;
}

function redactField(field: ProposedField): RedactedField {
  const { display, profile, ...names } = field;
  const redacted: RedactedField = names;
  if (display) {
    redacted.display = {
      value: redactDisplay(display.value),
      rule: display.rule,
      kind: display.kind,
    };
  }
  if (profile) redacted.profile = redactFieldProfile(profile);
  return redacted;
}

/** A proposed or mapped relation without its badge values, currencies and value ranges. */
export function redactResource(resource: ProposedResource): RedactedResource {
  return { ...resource, fields: resource.fields.map(redactField) };
}

function redactOpenItem(item: OpenItem): RedactedOpenItem {
  const { resource, open, ...rest } = item;
  const redacted: RedactedOpenItem = rest;
  if (resource) redacted.resource = redactResource(resource);
  if (open) redacted.open = open.map(redactOpenItem);
  return redacted;
}

function redactProposal(proposal: MappingProposal): RedactedProposal {
  return {
    ...proposal,
    resources: proposal.resources.map(redactResource),
    open: proposal.open.map(redactOpenItem),
  };
}

/** An analysis job without the values its proposal read from rows. */
export function redactAnalysis(state: AnalysisState): RedactedAnalysis {
  const { proposal, ...rest } = state;
  return proposal ? { ...rest, proposal: redactProposal(proposal) } : rest;
}

/** A module's mapping without the badge values and currencies its code holds. */
export function redactMapping(mapped: MappedRelation): RedactedMappedRelation {
  return { ...mapped, resource: redactResource(mapped.resource) };
}

/** A changed file without its diff. */
export function redactChange({ path, kind }: FileChange): RedactedChange {
  return { path, kind };
}

function distinctTypes(elements: JsonTypes[]): JsonTypes {
  const items = new Map(
    elements.map((types) => [JSON.stringify(types), types]),
  );
  return { length: elements.length, items: [...items.values()] };
}

/** Reads a JSON value as its types: each leaf its type, each list its length and distinct element types. */
const JsonTypesSchema: z.ZodType<JsonTypes, z.ZodTypeDef, unknown> = z.lazy(
  () =>
    z.union([
      z.string().transform((): JsonTypes => "string"),
      z.number().transform((): JsonTypes => "number"),
      z.boolean().transform((): JsonTypes => "boolean"),
      z.null().transform((): JsonTypes => "null"),
      z.array(JsonTypesSchema).transform(distinctTypes),
      z.record(z.string(), JsonTypesSchema),
    ]),
);

/** A query preview with its body reduced to the types it holds, and `status` when one is given. */
export function redactPreview(
  preview: QueryPreview,
  status?: PreviewStatus,
): RedactedQueryPreview {
  const body = JsonTypesSchema.parse(JSON.parse(JSON.stringify(preview.body)));
  return status === undefined
    ? { ...preview, body }
    : { ...preview, status, body };
}

/** The data of each builder operation an MCP tool answers redacted. */
export type RedactedData =
  | RedactedAnalysis
  | RedactedMappedRelation[]
  | RedactedQueryPreview
  | MapResourcesResult;

/** An operation's result, as the AI reads it: its data redacted, its changes without their diffs. */
export type RedactedResult<U> =
  | {
      ok: true;
      data: U;
      changes: RedactedChange[];
      warnings?: OpWarning[];
    }
  | Extract<OpResult, { ok: false }>;

/** An operation's result with `redact` applied to its data and every diff left out. */
export function redactedResult<T, U>(
  result: OpResult<T>,
  redact: (data: T) => U,
): RedactedResult<U> {
  if (!result.ok) return result;
  return {
    ...result,
    data: redact(result.data),
    changes: result.changes.map(redactChange),
  };
}
