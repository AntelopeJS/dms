import { describe, expect, it } from "vitest";
import { buildAgendaList } from "../layers/dms-ui/app/build/composables/agenda/agendaListLayout";
import { makeDays, makeOccurrence } from "./agenda-view-fixtures";

describe("agenda list", () => {
  const days = makeDays("2026-10-24", 7, { today: "2026-10-25" });

  it("skips empty days and orders all-day rows first, then by start", () => {
    const list = buildAgendaList(days, [
      makeOccurrence({
        key: "late",
        start: "2026-10-25T15:00:00+01:00",
        end: "2026-10-25T16:00:00+01:00",
      }),
      makeOccurrence({
        key: "early",
        start: "2026-10-25T09:00:00+01:00",
        end: "2026-10-25T10:00:00+01:00",
      }),
      makeOccurrence({
        key: "leave",
        start: "2026-10-25",
        end: "2026-10-25",
        allDay: true,
      }),
      makeOccurrence({
        key: "next",
        start: "2026-10-28T09:00:00+01:00",
        end: "2026-10-28T09:30:00+01:00",
      }),
    ]);
    expect(list.map((entry) => entry.day.key)).toEqual([
      "2026-10-25",
      "2026-10-28",
    ]);
    expect(list[0]!.day.isToday).toBe(true);
    expect(list[0]!.rows.map((row) => [row.occurrence.key, row.part])).toEqual([
      ["leave", "allDay"],
      ["early", "single"],
      ["late", "single"],
    ]);
  });

  it("lists an event of several days under each day it covers", () => {
    const list = buildAgendaList(days, [
      makeOccurrence({
        key: "trip",
        start: "2026-10-26T18:00:00+01:00",
        end: "2026-10-28T10:00:00+01:00",
      }),
      makeOccurrence({
        key: "camp",
        start: "2026-10-20",
        end: "2026-10-24",
        allDay: true,
      }),
    ]);
    expect(
      list.map((entry) => [entry.day.key, entry.rows.map((row) => row.part)]),
    ).toEqual([
      ["2026-10-24", ["allDay"]],
      ["2026-10-26", ["start"]],
      ["2026-10-27", ["middle"]],
      ["2026-10-28", ["end"]],
    ]);
  });

  it("ends a timed event at midnight on the day before", () => {
    const list = buildAgendaList(days, [
      makeOccurrence({
        key: "evening",
        start: "2026-10-26T20:00:00+01:00",
        end: "2026-10-27T00:00:00+01:00",
      }),
    ]);
    expect(list.map((entry) => entry.day.key)).toEqual(["2026-10-26"]);
    expect(list[0]!.rows[0]!.part).toBe("single");
  });

  it("is empty without events or days", () => {
    expect(buildAgendaList(days, [])).toEqual([]);
    expect(
      buildAgendaList(
        [],
        [
          makeOccurrence({
            key: "x",
            start: "2026-10-25",
            end: "2026-10-25",
            allDay: true,
          }),
        ],
      ),
    ).toEqual([]);
  });
});
