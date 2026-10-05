import {
  BasicDataModel,
  Field,
  Fixture,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

const tableName = "playground_job_runs";

export type JobRunStatus =
  | "healthy"
  | "running"
  | "degraded"
  | "failing"
  | "paused";

const HOUR_MS = 60 * 60 * 1000;
const RUN_SPREAD_HOURS = 7;
const HISTORY_LENGTH = 12;
const STEP_COUNTS = [8, 12, 20, 41, 44];

interface JobSeed {
  name: string;
  status: JobRunStatus;
  lastError?: string;
  durationMs: number;
  outputBytes: number;
}

const JOBS: JobSeed[] = [
  {
    name: "Sync paid invoices to ERP",
    status: "failing",
    lastError: "HTTP 502 at Push invoice to ERP",
    durationMs: 1_800,
    outputBytes: 24_800,
  },
  {
    name: "Escalate API errors to email",
    status: "degraded",
    lastError: "Timeout after 30 s",
    durationMs: 910,
    outputBytes: 3_200,
  },
  {
    name: "Sync stock levels from WMS",
    status: "degraded",
    durationMs: 3_000,
    outputBytes: 1_420_000,
  },
  {
    name: "Abandoned cart reminder",
    status: "healthy",
    durationMs: 640,
    outputBytes: 12_000,
  },
  {
    name: "Notify sales on large order",
    status: "healthy",
    durationMs: 420,
    outputBytes: 2_100,
  },
  {
    name: "Nightly customer export",
    status: "running",
    durationMs: 42_100,
    outputBytes: 86_400_000,
  },
  {
    name: "Retry failed payment webhooks",
    status: "healthy",
    durationMs: 3_200,
    outputBytes: 8_400,
  },
  {
    name: "Weekly invoice digest",
    status: "paused",
    durationMs: 5_400,
    outputBytes: 640_000,
  },
];

const RUNS_PER_JOB = 4;

// A repeatable series per run: the same seed always draws the same line.
function historyOf(seed: number): number[] {
  return Array.from({ length: HISTORY_LENGTH }, (_, index) =>
    Math.round(40 + 30 * Math.sin((seed + index) / 2) + ((seed * index) % 17)),
  );
}

function seedRuns() {
  const now = Date.now();
  return JOBS.flatMap((job, jobIndex) =>
    Array.from({ length: RUNS_PER_JOB }, (_, runIndex) => {
      const index = jobIndex * RUNS_PER_JOB + runIndex;
      const startedAt = new Date(now - index * RUN_SPREAD_HOURS * HOUR_MS);
      const total = STEP_COUNTS[index % STEP_COUNTS.length]!;
      const isLatest = runIndex === 0;
      const status: JobRunStatus = isLatest ? job.status : "healthy";
      const failed = status === "failing" ? 2 : 0;
      const done = status === "running" ? Math.floor(total * 0.7) : total;
      return {
        _id: `run-${index + 1}`,
        runId: `run_${(0x8f3a2c + index * 4099).toString(16)}`,
        name: job.name,
        status,
        lastError: isLatest ? job.lastError : undefined,
        doneSteps: done,
        totalSteps: total,
        failedSteps: failed,
        history: historyOf(index),
        durationMs: job.durationMs * (1 + runIndex * 0.1),
        outputBytes: job.outputBytes,
        startedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
      };
    }),
  );
}

@RegisterTable(tableName, CORE_SCHEMA_NAME)
@Fixture(seedRuns)
export class JobRun extends Table {
  @Field("string") declare _id: string;

  @Field("string") declare runId: string;
  @Field("string") declare name: string;
  @Index() @Field("string") declare status: JobRunStatus;
  @Field("string") declare lastError?: string;
  @Field("number") declare doneSteps: number;
  @Field("number") declare totalSteps: number;
  @Field("number") declare failedSteps: number;
  @Field(["number"]) declare history: number[];
  @Field("number") declare durationMs: number;
  @Field("number") declare outputBytes: number;
  @Index() @Field("string") declare ownerId?: string;

  @Index() @Field("date") declare startedAt: Date;
  @Index() @Field("date") declare createdAt: Date;
  @Index() @Field("date") declare updatedAt: Date;
}

export class JobRunModel extends BasicDataModel(JobRun, tableName) {}
