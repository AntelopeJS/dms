// What a drop does: hands the change to the save engine (or the new range to
// the form) and says what happened in the block's live region.

import type { Ref } from "vue";
import type {
  AgendaContext,
  AgendaDragPreview,
  AgendaFormat,
  AgendaPlacement,
  ResolvedAgendaOptions,
} from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragMath";
import {
  lastDayOf,
  occurrencePlacement,
  samePlacement,
} from "./agendaDragMath";
import { zonedDayKey } from "./agendaTime";
import {
  copyChange,
  placementChange,
  scheduleChange,
  unscheduleChange,
} from "./agendaDragChange";

/** What a drop needs of the agenda (a part of `AgendaDragDeps`). */
export interface AgendaDropCommitDeps {
  options: Readonly<Ref<ResolvedAgendaOptions>>;
  apply: AgendaContext["apply"];
  createAt: AgendaContext["createAt"];
  format: AgendaFormat;
  t: (key: string, params?: Record<string, unknown>) => string;
}

type Announce = (message: string) => void;

/** The save engine reports a refusal itself (toast, event put back): a rejection is not this drop's to handle. */
const ignore = () => undefined;

export class AgendaDropCommitter {
  constructor(
    private readonly deps: AgendaDropCommitDeps,
    private readonly announce: Announce,
  ) {}

  /** Writes `dms.agenda.drag.<key>` to the live region. */
  say(key: string, params: Record<string, unknown> = {}): void {
    this.announce(this.deps.t(`dms.agenda.drag.${key}`, params));
  }

  /** "Monday 26 October 09:00 – 10:00", or the days of an all-day placement. */
  describe(placement: AgendaPlacement): string {
    const { format } = this.deps;
    const timeZone = this.deps.options.value.timeZone;
    const first = zonedDayKey(placement.start, timeZone);
    if (!placement.allDay) {
      return `${format.day(first, "long")} ${format.timeRange(placement.start, placement.end)}`;
    }
    const last = lastDayOf(placement, timeZone);
    return last === first
      ? format.day(first, "long")
      : `${format.day(first, "long")} – ${format.day(last, "long")}`;
  }

  /** Commits what a drag left in `dropped` (`null`: dropped outside every surface). */
  drop(
    source: AgendaDragSource,
    title: string,
    dropped: AgendaDragPreview | null,
  ): void {
    if (!dropped) {
      this.say("cancelled");
      return;
    }
    if (!dropped.valid) {
      this.say("refused", { title, reason: dropped.reason ?? "" });
      return;
    }
    const placement: AgendaPlacement = {
      start: dropped.start,
      end: dropped.end,
      allDay: dropped.allDay,
      resourceIds: dropped.resourceIds,
    };
    if (source.kind === "create" || source.kind === "select") {
      this.deps.createAt(placement);
      this.say("picked", { when: this.describe(placement) });
      return;
    }
    if (source.kind === "external") {
      if (dropped.toPending || !source.item) return;
      void this.deps
        .apply(
          scheduleChange(
            source.item,
            placement,
            this.deps.options.value.timeZone,
          ),
        )
        .catch(ignore);
      this.say("scheduled", { title, when: this.describe(placement) });
      return;
    }
    this.dropOccurrence(source, title, dropped, placement);
  }

  private dropOccurrence(
    source: AgendaDragSource,
    title: string,
    dropped: AgendaDragPreview,
    placement: AgendaPlacement,
  ): void {
    const { occurrence } = source;
    if (!occurrence) return;
    const timeZone = this.deps.options.value.timeZone;
    if (dropped.toPending) {
      void this.deps
        .apply(unscheduleChange(occurrence), occurrence)
        .catch(ignore);
      this.say("unscheduled", { title });
      return;
    }
    if (dropped.copy) {
      void this.deps
        .apply(copyChange(occurrence, placement, timeZone))
        .catch(ignore);
      this.say("copied", { title, when: this.describe(placement) });
      return;
    }
    if (samePlacement(placement, occurrencePlacement(occurrence))) return;
    const kind = source.kind === "move" ? "move" : "resize";
    void this.deps
      .apply(placementChange(occurrence, placement, kind, timeZone), occurrence)
      .catch(ignore);
    this.say(kind === "move" ? "moved" : "resized", {
      title,
      when: this.describe(placement),
    });
  }
}
