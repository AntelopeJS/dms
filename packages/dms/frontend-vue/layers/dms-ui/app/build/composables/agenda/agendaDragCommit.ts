// What a drop does: hands the change to the save engine (or the new range to
// the form) and says what happened in the block's live region.

import type { Ref } from "vue";
import type {
  AgendaContext,
  AgendaDragPreview,
  AgendaOccurrence,
  AgendaFormat,
  AgendaPlacement,
  ResolvedAgendaOptions,
} from "./agendaModel";
import type { AgendaDragSource } from "./agendaDragBasics";
import {
  lastDayOf,
  occurrencePlacement,
  samePlacement,
} from "./agendaDragBasics";
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

/** Gives the focus back to an event's chip once its change has settled. */
type Refocus = (key: string) => void;

/** The save engine reports a refusal itself (toast, event put back): a rejection is not this drop's to handle. */
const ignore = () => undefined;

export class AgendaDropCommitter {
  constructor(
    private readonly deps: AgendaDropCommitDeps,
    private readonly announce: Announce,
    private readonly refocus: Refocus = () => {},
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
    /** The moved chip had the focus (a key, or a drag that began on a focused chip). */
    keepsFocus = false,
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
    this.dropOccurrence(source, title, dropped, placement, keepsFocus);
  }

  /**
   * Writes a change of an occurrence; once it settles (drawn at its new
   * place, or put back), the chip of a focused event takes the focus back.
   */
  private write(
    change: Parameters<AgendaDropCommitDeps["apply"]>[0],
    occurrence: AgendaOccurrence | undefined,
    refocusKey: string | undefined,
  ): void {
    const written = occurrence
      ? this.deps.apply(change, occurrence)
      : this.deps.apply(change);
    void written.catch(ignore).finally(() => {
      if (refocusKey) this.refocus(refocusKey);
    });
  }

  private dropOccurrence(
    source: AgendaDragSource,
    title: string,
    dropped: AgendaDragPreview,
    placement: AgendaPlacement,
    keepsFocus: boolean,
  ): void {
    const { occurrence } = source;
    if (!occurrence) return;
    const timeZone = this.deps.options.value.timeZone;
    const refocusKey = keepsFocus ? occurrence.key : undefined;
    if (dropped.toPending) {
      void this.deps
        .apply(unscheduleChange(occurrence), occurrence)
        .catch(ignore);
      this.say("unscheduled", { title });
      return;
    }
    // Dropped where it is: neither a move nor a copy on top of itself.
    if (samePlacement(placement, occurrencePlacement(occurrence))) return;
    if (dropped.copy) {
      this.write(
        copyChange(occurrence, placement, timeZone),
        undefined,
        refocusKey,
      );
      this.say("copied", { title, when: this.describe(placement) });
      return;
    }
    const kind = source.kind === "move" ? "move" : "resize";
    this.write(
      placementChange(occurrence, placement, kind, timeZone),
      occurrence,
      refocusKey,
    );
    this.say(kind === "move" ? "moved" : "resized", {
      title,
      when: this.describe(placement),
    });
  }
}
