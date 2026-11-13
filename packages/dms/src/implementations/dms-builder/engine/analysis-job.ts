import { randomUUID } from "node:crypto";
import type {
  RelationDescription,
  RelationProfile,
  RelationSummary,
} from "@antelopejs/interface-database-catalog";
import type {
  AnalyseDatabaseInput,
  AnalysisProgress,
  AnalysisState,
  MappingProposal,
  OpenItem,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import { impliedReferenceChecks, proposeMapping } from "./analysis";
import { type ReferenceTarget, referenceTarget } from "./analysis-fields";
import { type ImpliedReference, relationName } from "./analysis-input";
import { type CatalogConnection, catalogOf } from "./catalog-connection";
import { excludedRelationsOf } from "./mapped-modules";
import { targetModule } from "./modules";
import { invalidConfig, notFound } from "./ops";
import { mappedRecordsOf } from "./resource-index";

const DESCRIBE_BATCH = 20;
/** Above this many relations to profile, the analysis asks which schemas matter first. */
const PROFILE_LIMIT = 200;

const jobs = new Map<string, AnalysisState>();
/** Each connection's latest job, by id: the running one, or else the last to finish. */
const latestByConnection = new Map<string, string>();

function jobOf(connection: string): AnalysisState | undefined {
  const id = latestByConnection.get(connection);
  return id === undefined ? undefined : jobs.get(id);
}

function emptyProgress(): AnalysisProgress {
  return { relations: 0, described: 0, toProfile: 0, profiled: 0, timeouts: 0 };
}

async function describeAll(
  catalog: CatalogConnection,
  relations: string[],
  progress: AnalysisProgress,
): Promise<RelationDescription[]> {
  const described: RelationDescription[] = [];
  for (let start = 0; start < relations.length; start += DESCRIBE_BATCH) {
    const batch = relations.slice(start, start + DESCRIBE_BATCH);
    described.push(...(await catalog.DescribeRelations(batch)));
    progress.described = described.length;
  }
  return described;
}

function timeoutsOf(profile: RelationProfile): number {
  const measures = [
    profile.rows,
    ...profile.columns.flatMap((column) => [
      column.nulls,
      column.distinct,
      column.range,
      column.months,
      column.categories,
      column.length,
    ]),
    ...profile.references.map((reference) => reference.fanOut),
  ];
  return measures.filter((measure) => measure?.status === "timeout").length;
}

async function profileAll(
  catalog: CatalogConnection,
  relations: string[],
  progress: AnalysisProgress,
): Promise<RelationProfile[]> {
  progress.toProfile = relations.length;
  const profiles: RelationProfile[] = [];
  for (const relation of relations) {
    const profile = await catalog.Profile({ relation });
    profiles.push(profile);
    progress.profiled = profiles.length;
    progress.timeouts += timeoutsOf(profile);
  }
  return profiles;
}

async function checkReferences(
  catalog: CatalogConnection,
  descriptions: RelationDescription[],
  settled: Settled,
): Promise<ImpliedReference[]> {
  const checks = impliedReferenceChecks(descriptions).filter(
    (check) => !settled.mapped.has(check.from.relation),
  );
  const checked: ImpliedReference[] = [];
  for (const check of checks) {
    checked.push({ ...check, match: await catalog.CheckReference(check) });
  }
  return checked;
}

/** The relations the module has settled already: mapped, or decided against. */
interface Settled {
  mapped: Map<string, boolean>;
  excluded: Set<string>;
}

function settledIn(module: string): Settled {
  const mapped = new Map(
    [...mappedRecordsOf(module)].map(([relation, record]) => [
      relation,
      record.routes === undefined || record.routes.length > 0,
    ]),
  );
  return {
    mapped,
    excluded: new Set(Object.keys(excludedRelationsOf(module))),
  };
}

function mappedTargets(
  descriptions: RelationDescription[],
  settled: Settled,
): Record<string, ReferenceTarget> {
  return Object.fromEntries(
    descriptions
      .filter((description) => settled.mapped.has(relationName(description)))
      .map((description) => [
        relationName(description),
        referenceTarget(
          description,
          settled.mapped.get(relationName(description)) ?? false,
        ),
      ]),
  );
}

function schemasQuestion(
  input: AnalyseDatabaseInput,
  pending: RelationSummary[],
): OpenItem {
  const counts = new Map<string, number>();
  for (const summary of pending) {
    counts.set(summary.schema, (counts.get(summary.schema) ?? 0) + 1);
  }
  return {
    id: `schemas:${input.connection}`,
    kind: "schemas",
    question: `The database has ${pending.length} tables, more than one analysis reads at once, so none were read yet. Pick the schemas to analyse.`,
    options: [...counts].map(([schema, count]) => ({
      value: schema,
      title: `${schema} (${count})`,
    })),
    proposed: null,
  };
}

async function analyse(
  input: AnalyseDatabaseInput,
  catalog: CatalogConnection,
  progress: AnalysisProgress,
): Promise<MappingProposal> {
  const settled = settledIn(input.module);
  const info = await catalog.Info();
  const summaries = await catalog.ListRelations(input.schemas);
  const pending = summaries.filter(
    (summary) =>
      !settled.mapped.has(relationName(summary)) &&
      !settled.excluded.has(relationName(summary)),
  );
  progress.relations = pending.length;
  const mappable = pending.filter((summary) => !summary.unmappable);
  const base = { connection: input.connection, module: input.module, info };
  if (!input.schemas && mappable.length > PROFILE_LIMIT) {
    return {
      ...proposeMapping({
        ...base,
        summaries: [],
        descriptions: [],
        profiles: [],
        references: [],
        mapped: {},
      }),
      open: [schemasQuestion(input, mappable)],
    };
  }
  const toDescribe = [
    ...mappable.map(relationName),
    ...summaries
      .map(relationName)
      .filter((relation) => settled.mapped.has(relation)),
  ];
  const described = await describeAll(catalog, toDescribe, progress);
  const descriptions = described.filter(
    (description) => !settled.mapped.has(relationName(description)),
  );
  const profiles = await profileAll(
    catalog,
    descriptions.map(relationName),
    progress,
  );
  return proposeMapping({
    ...base,
    summaries: pending,
    descriptions,
    profiles,
    references: await checkReferences(catalog, described, settled),
    mapped: mappedTargets(described, settled),
  });
}

function run(
  job: AnalysisState,
  input: AnalyseDatabaseInput,
  catalog: CatalogConnection,
): void {
  analyse(input, catalog, job.progress).then(
    (proposal) => {
      job.status = "done";
      job.proposal = proposal;
    },
    (error: unknown) => {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    },
  );
}

function snapshot(job: AnalysisState): OpResult<AnalysisState> {
  return {
    ok: true,
    data: { ...job, progress: { ...job.progress } },
    changes: [],
  };
}

/**
 * Starts an analysis of one of the builder's connections, or answers the one running on it. A
 * finished job is replaced by the next one on its connection.
 */
export function startAnalysis(
  input: AnalyseDatabaseInput,
): OpResult<AnalysisState> {
  const catalog = catalogOf(input.connection);
  if (!catalog) {
    return invalidConfig<AnalysisState>(
      `dms-builder has no catalog connection "${input.connection}"; declare one in its importOverrides`,
    );
  }
  const module = targetModule(input.module);
  if (!module || module.isProject) {
    return invalidConfig<AnalysisState>(
      `analyse for a local module bound to the database, not ${module ? "the project's own" : `unknown module "${input.module}"`}`,
    );
  }
  const current = jobOf(input.connection);
  if (current?.status === "running") {
    return snapshot(current);
  }
  if (current) {
    jobs.delete(current.id);
  }
  const job: AnalysisState = {
    id: randomUUID(),
    connection: input.connection,
    status: "running",
    progress: emptyProgress(),
  };
  jobs.set(job.id, job);
  latestByConnection.set(job.connection, job.id);
  run(job, input, catalog);
  return snapshot(job);
}

export function analysisState(id: string): OpResult<AnalysisState> {
  const job = jobs.get(id);
  return job ? snapshot(job) : notFound<AnalysisState>(id);
}

/** The latest analysis of a connection: the running one, or else the last to finish. */
export function latestAnalysis(connection: string): OpResult<AnalysisState> {
  const job = jobOf(connection);
  return job ? snapshot(job) : notFound<AnalysisState>(connection);
}
