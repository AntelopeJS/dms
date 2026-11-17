import { describe, expect, it } from "vitest";
import {
  completeChange,
  seriesChangeDay,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaApply";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";

const series: AgendaEvent = {
  id: "s1",
  title: "Hours",
  start: "2026-11-02T08:30:00.000Z",
  end: "2026-11-02T11:30:00.000Z",
  revision: "r7",
  changeableFrom: "2026-11-14",
  recurrence: { frequency: "weekly", interval: 1, weekdays: [1] },
};

describe("a change names the version of the event the user saw", () => {
  it("sends the event's revision with a change of it, and keeps one the caller set (fails when the route cannot tell what the user saw)", () => {
    const edit = completeChange({
      change: { kind: "update", id: "s1", patch: { title: "New" } },
      event: series,
      timeZone: "Europe/Brussels",
    });
    const kept = completeChange({
      change: { kind: "delete", id: "s1", revision: "r6" },
      event: series,
      timeZone: "Europe/Brussels",
    });
    const created = completeChange({
      change: { kind: "create", patch: { title: "x" } },
      event: series,
      timeZone: "Europe/Brussels",
    });
    expect([edit.revision, kept.revision, created.revision]).toEqual([
      "r7",
      "r6",
      undefined,
    ]);
  });

  it("names the day a series change applies from: the occurrence's, or the first day still changeable when it is earlier (fails when the prompt names a past day)", () => {
    expect([
      seriesChangeDay(series, "2026-11-09"),
      seriesChangeDay(series, "2026-11-16"),
      seriesChangeDay({ ...series, changeableFrom: undefined }, "2026-11-09"),
    ]).toEqual(["2026-11-14", "2026-11-16", undefined]);
  });
});
