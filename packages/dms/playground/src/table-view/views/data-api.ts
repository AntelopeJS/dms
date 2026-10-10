import {
  Context,
  Controller,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  Column,
  DefaultDisplays,
  resolveBulkRowIds,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { JobRun, JobRunModel, type JobRunStatus } from "./database";

export const JOB_RUN_STATUSES = [
  { value: "healthy", label: "Healthy", textColor: "success" },
  { value: "running", label: "Running", textColor: "info" },
  { value: "degraded", label: "Degraded", textColor: "warning" },
  { value: "failing", label: "Failing", textColor: "error" },
  { value: "paused", label: "Paused", textColor: "neutral" },
];

const HIDDEN_IN_FORMS = ReadonlyBehaviorType.hidden;

// The HTTP answer a run's last call got, and its tone by status class: the
// server picks the tone per row, the column only names the field.
const HTTP_STATUS_BY_RUN: Record<JobRunStatus, number> = {
  healthy: 200,
  running: 202,
  paused: 304,
  degraded: 429,
  failing: 502,
};
const HTTP_CLASS_SIZE = 100;
const HTTP_TONE_BY_CLASS: Record<number, Tone> = {
  2: "success",
  3: "info",
  4: "warning",
  5: "error",
};

// The locales a run's notification template is written in: a present one as
// a soft pill, a missing one outlined.
const NOTIFICATION_LOCALES = ["en", "fr", "de"] as const;
const LOCALES_BY_RUN: Record<JobRunStatus, readonly string[]> = {
  healthy: NOTIFICATION_LOCALES,
  running: ["en", "fr"],
  paused: ["en", "fr"],
  degraded: ["en"],
  failing: ["en"],
};

function localePills(status: JobRunStatus): DefaultDisplays.PillItem[] {
  const present = LOCALES_BY_RUN[status];
  return NOTIFICATION_LOCALES.map((locale) =>
    present.includes(locale)
      ? { label: locale.toUpperCase(), tone: "primary", variant: "soft" }
      : { label: locale.toUpperCase(), variant: "outline" },
  );
}

/**
 * Job runs of the "Views, grouped & cells" demo: each column draws its value
 * through one of the cell displays (status pill, a status pill toned by the
 * row, pills styled by the row, progress, sparkline, duration, bytes, mono).
 */
@RegisterDataController()
export class jobRunDataAPI extends DataController(
  JobRun,
  TableViewRoutes.All,
  Controller("/api/playground/job-runs"),
) {
  @ModelReference()
  @Model(JobRunModel)
  declare model: JobRunModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({
    name: "Procedure",
    type: new DefaultDataTypes.StringType({ placeholder: "Sync invoices" }),
    filterable: true,
    size: 240,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Searchable()
  @Listable()
  @Column({
    name: "Run",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
    display: new DefaultDisplays.MonoDisplay({ copy: true }),
    size: 150,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare runId: string;

  @Listable()
  @Sortable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: JOB_RUN_STATUSES }),
    filterable: true,
    defaultValue: "healthy",
    display: new DefaultDisplays.StatusPillDisplay({
      tones: {
        healthy: "success",
        running: "info",
        degraded: "warning",
        failing: "error",
        paused: "neutral",
      },
      subField: "lastError",
      liveValues: ["running"],
    }),
    size: 220,
    cellWrap: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: JobRunStatus;

  @Listable()
  @Column({
    name: "Last error",
    type: new DefaultDataTypes.StringType(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare lastError: string;

  @Listable(["status"])
  @Column({
    name: "Last call",
    type: new DefaultDataTypes.NumberType(),
    display: new DefaultDisplays.StatusPillDisplay({
      toneField: "lastCallTone",
    }),
    readonlyBehavior: HIDDEN_IN_FORMS,
    size: 110,
  })
  @Access(AccessMode.ReadOnly)
  get lastCall(): number {
    return HTTP_STATUS_BY_RUN[this.table.status];
  }

  @Listable(["status"])
  @Access(AccessMode.ReadOnly)
  get lastCallTone(): Tone {
    const statusClass = Math.floor(
      HTTP_STATUS_BY_RUN[this.table.status] / HTTP_CLASS_SIZE,
    );
    return HTTP_TONE_BY_CLASS[statusClass] ?? "neutral";
  }

  @Listable(["status"])
  @Column({
    name: "Locales",
    type: new DefaultDataTypes.StringType(),
    display: new DefaultDisplays.PillsDisplay(),
    readonlyBehavior: HIDDEN_IN_FORMS,
    size: 140,
  })
  @Access(AccessMode.ReadOnly)
  get locales(): DefaultDisplays.PillItem[] {
    return localePills(this.table.status);
  }

  @Listable()
  @Column({
    name: "Steps",
    type: new DefaultDataTypes.NumberType({ min: 0 }),
    display: new DefaultDisplays.ProgressDisplay({
      doneField: "doneSteps",
      totalField: "totalSteps",
      errorField: "failedSteps",
    }),
    size: 190,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare doneSteps: number;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare totalSteps: number;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare failedSteps: number;

  @Listable()
  @Column({
    name: "Last 12 runs",
    type: new DefaultDataTypes.NumberType(),
    display: new DefaultDisplays.SparklineDisplay({ field: "history" }),
    readonlyBehavior: HIDDEN_IN_FORMS,
    size: 130,
  })
  @Access(AccessMode.ReadOnly)
  declare history: number[];

  @Listable()
  @Sortable()
  @Column({
    name: "Avg",
    type: new DefaultDataTypes.NumberType({ min: 0 }),
    display: new DefaultDisplays.DurationDisplay(),
    size: 100,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare durationMs: number;

  @Listable()
  @Sortable()
  @Column({
    name: "Output",
    type: new DefaultDataTypes.NumberType({ min: 0 }),
    display: new DefaultDisplays.BytesDisplay(),
    size: 100,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare outputBytes: number;

  @Listable()
  @Column({
    name: "Owner",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
    isVisible: false,
    readonlyBehavior: HIDDEN_IN_FORMS,
  })
  @Access(AccessMode.ReadOnly)
  declare ownerId: string;

  @Listable()
  @Sortable()
  @Column({
    name: "Started",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
    display: new DefaultDisplays.RelativeDateDisplay(),
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare startedAt: Date;

  /**
   * Restarts the selected runs, or every run the table's filters match after
   * "Select all N matching": the bulk route finds its rows itself.
   */
  @Post("rerun")
  async rerun(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ): Promise<{ count: number }> {
    const ids = await resolveBulkRowIds(this, ctx, user);
    await Promise.all(
      ids.map((id) =>
        this.model.update(id, { status: "running", lastError: undefined }),
      ),
    );
    return { count: ids.length };
  }

  /** Makes the caller the run's owner, for the "Mine" view's `{{user.id}}`. */
  @Post("assign-to-me")
  async assignToMe(
    @Parameter("id", "query") id: string,
    @AuthUser() user: User,
  ): Promise<{ ok: boolean }> {
    await this.model.update(id, { ownerId: user._id });
    return { ok: true };
  }
}
