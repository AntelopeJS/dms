/**
 * Recurring events expanded for the range shown: weekly on several days
 * with exceptions, `until` and `count`, intervals, monthly and yearly edge
 * days, and a series keeping its wall-clock time across a DST change.
 */
import { describe, expect, it } from "vitest";
import { expandRecurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaRecurrence";
import { buildOccurrences } from "../layers/dms-ui/app/build/composables/agenda/agendaOccurrences";
import type { AgendaEvent } from "../layers/dms-ui/app/types/full-agenda";
import { dayStartEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";

const BRUSSELS = "Europe/Brussels";
const window = (from: string, to: string, spanDays = 0) => ({
  from,
  to,
  spanDays,
});

describe("expandRecurrence", () => {
  it("repeats every weekday, the exceptions left out", () => {
    const days = expandRecurrence(
      "2026-10-19",
      {
        frequency: "weekly",
        weekdays: [1, 2, 3, 4, 5],
        exceptions: ["2026-10-21"],
      },
      window("2026-10-19", "2026-10-25"),
    );
    expect(days).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-22",
      "2026-10-23",
    ]);
  });

  it("stops at `until`, inclusive", () => {
    const days = expandRecurrence(
      "2026-10-19",
      { frequency: "daily", until: "2026-10-21" },
      window("2026-10-01", "2026-10-31"),
    );
    expect(days).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("counts every occurrence from the start, excluded ones included", () => {
    const days = expandRecurrence(
      "2026-10-05",
      { frequency: "weekly", count: 4, exceptions: ["2026-10-12"] },
      window("2026-10-01", "2026-12-31"),
    );
    expect(days).toEqual(["2026-10-05", "2026-10-19", "2026-10-26"]);
  });

  it("counts the occurrences before the window too", () => {
    const days = expandRecurrence(
      "2026-09-01",
      { frequency: "daily", count: 40 },
      window("2026-10-05", "2026-10-31"),
    );
    expect(days).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
    ]);
  });

  it("falls every other week on the start's weekday, weeks from Monday", () => {
    const days = expandRecurrence(
      "2026-10-04",
      { frequency: "weekly", interval: 2, weekdays: [0, 3] },
      window("2026-10-01", "2026-10-31"),
    );
    // Week of 28 Sep holds Sunday 4 Oct; the next is the week of 12 Oct.
    expect(days).toEqual([
      "2026-10-04",
      "2026-10-14",
      "2026-10-18",
      "2026-10-28",
    ]);
  });

  it("skips the months without the start's day, and 29 February off leap years", () => {
    expect(
      expandRecurrence(
        "2026-01-31",
        { frequency: "monthly" },
        window("2026-01-01", "2026-05-31"),
      ),
    ).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
    expect(
      expandRecurrence(
        "2024-02-29",
        { frequency: "yearly" },
        window("2024-01-01", "2028-12-31"),
      ),
    ).toEqual(["2024-02-29", "2028-02-29"]);
  });

  it("keeps an occurrence that starts before the window and runs into it", () => {
    const days = expandRecurrence(
      "2026-10-01",
      { frequency: "weekly" },
      window("2026-10-10", "2026-10-20", 2),
    );
    expect(days).toEqual(["2026-10-08", "2026-10-15"]);
  });
});

const settings = {
  timeZone: BRUSSELS,
  from: "2026-10-19",
  to: "2026-10-30",
  start: dayStartEpoch("2026-10-19", BRUSSELS),
  end: dayStartEpoch("2026-10-31", BRUSSELS),
  defaultDurationMinutes: 60,
  editable: true,
  dragMove: true,
  dragResize: true,
  detailsContainer: "drawer" as const,
  calendars: new Map(),
  resources: new Map(),
};

describe("recurring occurrences", () => {
  const standup: AgendaEvent = {
    id: "standup",
    title: "Design standup",
    start: "2026-10-19T09:00:00+02:00",
    end: "2026-10-19T09:15:00+02:00",
    recurrence: { frequency: "weekly", weekdays: [1, 2, 3, 4, 5] },
  };

  it("keeps 09:00 wall-clock after the DST change, one occurrence per weekday", () => {
    const occurrences = buildOccurrences([standup], settings);
    expect(occurrences.map((occurrence) => occurrence.key)).toEqual([
      "standup@2026-10-19",
      "standup@2026-10-20",
      "standup@2026-10-21",
      "standup@2026-10-22",
      "standup@2026-10-23",
      "standup@2026-10-26",
      "standup@2026-10-27",
      "standup@2026-10-28",
      "standup@2026-10-29",
      "standup@2026-10-30",
    ]);
    const before = occurrences[0]!;
    const after = occurrences[5]!;
    expect(before.start).toBe(Date.parse("2026-10-19T07:00:00Z"));
    expect(after.start).toBe(Date.parse("2026-10-26T08:00:00Z"));
    expect(after.startMinutes).toBe(540);
    expect(after.endMinutes).toBe(555);
    expect(after.recurring).toEqual({
      seriesId: "standup",
      occurrence: "2026-10-26",
    });
  });

  it("repeats an all-day event over its days", () => {
    const leave: AgendaEvent = {
      id: "leave",
      title: "Leave",
      start: "2026-10-01",
      end: "2026-10-02",
      allDay: true,
      recurrence: { frequency: "weekly", count: 5 },
    };
    const occurrences = buildOccurrences([leave], settings);
    expect(
      occurrences.map((occurrence) => [occurrence.startDay, occurrence.endDay]),
    ).toEqual([
      ["2026-10-22", "2026-10-23"],
      ["2026-10-29", "2026-10-30"],
    ]);
  });
});
