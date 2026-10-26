import { describe, expect, it } from "vitest";
import {
  buildYearMonths,
  buildYearPlanner,
  daysInMonth,
  inPendingRange,
  pendingRange,
  yearMonths,
} from "../layers/dms-ui/app/build/composables/agenda/agendaYearLayout";
import { backgroundSpans } from "../layers/dms-ui/app/build/composables/agenda/agendaBackgroundSpans";
import { BRUSSELS, makeOccurrence } from "./agenda-view-fixtures";

const HOLIDAYS = backgroundSpans(
  [
    {
      id: "toussaint",
      start: "2026-11-01",
      kind: "holiday",
      label: "Toussaint",
    },
    {
      id: "armistice",
      start: "2026-11-11",
      kind: "holiday",
      label: "Armistice",
    },
  ],
  BRUSSELS,
);

const LEAVE = makeOccurrence({
  key: "leave",
  start: "2026-10-26",
  end: "2026-10-31",
  allDay: true,
  title: "Congé",
  short: "7,6",
});
const MEETING = makeOccurrence({
  key: "meeting",
  start: "2026-10-27T09:00:00+01:00",
  end: "2026-10-27T10:00:00+01:00",
});

describe("year planner", () => {
  const planner = buildYearPlanner({
    from: "2026-01-01",
    today: "2026-10-25",
    occurrences: [LEAVE, MEETING],
    backgrounds: HOLIDAYS,
  });

  it("has twelve rows of 31 cells, nonexistent days blank", () => {
    expect(planner).toHaveLength(12);
    expect(planner.every((month) => month.cells.length === 31)).toBe(true);
    const february = planner[1]!;
    expect(
      february.cells
        .filter((cell) => cell.day === null)
        .map((cell) => cell.dayOfMonth),
    ).toEqual([29, 30, 31]);
    expect(planner[3]!.cells[30]!.day).toBeNull();
    expect(planner[11]!.cells[30]!.day).toBe("2026-12-31");
  });

  it("marks weekends and today", () => {
    const october = planner[9]!;
    expect(october.cells[24]).toMatchObject({
      day: "2026-10-25",
      weekday: 0,
      weekend: true,
      isToday: true,
    });
    expect(october.cells[25]).toMatchObject({
      weekday: 1,
      weekend: false,
      isToday: false,
    });
  });

  it("covers the days of an all-day event, inclusive, and not with timed ones", () => {
    const october = planner[9]!;
    const covered = october.cells
      .filter((cell) => cell.occurrences.length)
      .map((cell) => cell.dayOfMonth);
    expect(covered).toEqual([26, 27, 28, 29, 30, 31]);
    expect(
      october.cells[26]!.occurrences.map((occurrence) => occurrence.key),
    ).toEqual(["leave"]);
  });

  it("lays public holidays on their days", () => {
    const november = planner[10]!;
    expect(
      november.cells[0]!.backgrounds.map((span) => span.background.label),
    ).toEqual(["Toussaint"]);
    expect(november.cells[10]!.backgrounds).toHaveLength(1);
    expect(november.cells[1]!.backgrounds).toHaveLength(0);
  });

  it("runs twelve months from the range's first month", () => {
    expect(
      yearMonths("2026-09-01").map((ref) => `${ref.year}-${ref.month}`),
    ).toEqual([
      "2026-8",
      "2026-9",
      "2026-10",
      "2026-11",
      "2027-0",
      "2027-1",
      "2027-2",
      "2027-3",
      "2027-4",
      "2027-5",
      "2027-6",
      "2027-7",
    ]);
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("year of small months", () => {
  it("lays weeks from the week start with blanks outside the month", () => {
    const months = buildYearMonths({
      from: "2026-01-01",
      today: "2026-10-25",
      occurrences: [MEETING],
      backgrounds: [],
      weekStartsOn: 1,
    });
    const october = months[9]!;
    expect(october.weeks[0]!.days.slice(0, 3).map((cell) => cell.day)).toEqual([
      null,
      null,
      null,
    ]);
    expect(october.weeks[0]!.days[3]!.day).toBe("2026-10-01");
    expect(october.weeks.map((week) => week.week)).toEqual([
      40, 41, 42, 43, 44,
    ]);
    const tuesday27 = october.weeks
      .flatMap((week) => week.days)
      .find((cell) => cell.day === "2026-10-27");
    expect(tuesday27!.occurrences.map((occurrence) => occurrence.key)).toEqual([
      "meeting",
    ]);
  });

  it("starts weeks on Sunday when asked", () => {
    const months = buildYearMonths({
      from: "2026-01-01",
      today: "",
      occurrences: [],
      backgrounds: [],
      weekStartsOn: 0,
    });
    expect(months[10]!.weeks[0]!.days[0]!.day).toBe("2026-11-01");
  });

  it("numbers the weeks of a month across a year end", () => {
    const months = buildYearMonths({
      from: "2026-12-01",
      today: "",
      occurrences: [],
      backgrounds: [],
      weekStartsOn: 1,
    });
    expect(months[0]!.weeks.map((week) => week.week)).toEqual([
      49, 50, 51, 52, 53,
    ]);
    expect(months[1]!.weeks.map((week) => week.week)).toEqual([53, 1, 2, 3, 4]);
  });
});

describe("#34 week numbers from the week start", () => {
  it("numbers Sunday-start weeks of September 2026 by their Thursday, none twice", () => {
    const months = buildYearMonths({
      from: "2026-01-01",
      today: "",
      occurrences: [],
      backgrounds: [],
      weekStartsOn: 0,
    });
    expect(months[8]!.weeks.map((week) => week.week)).toEqual([
      36, 37, 38, 39, 40,
    ]);
  });

  it("numbers Saturday-start weeks too", () => {
    const months = buildYearMonths({
      from: "2026-01-01",
      today: "",
      occurrences: [],
      backgrounds: [],
      weekStartsOn: 6,
    });
    // Sat 24 – Fri 30 October: its Thursday is the 29th, week 44.
    const october = months[9]!.weeks.find((week) =>
      week.days.some((cell) => cell.day === "2026-10-24"),
    );
    expect(october?.week).toBe(44);
  });
});

describe("two-click range", () => {
  it("orders the pending range either way", () => {
    expect(pendingRange("2026-10-28", "2026-10-26")).toEqual({
      from: "2026-10-26",
      to: "2026-10-28",
    });
    expect(pendingRange("2026-10-28", null)).toEqual({
      from: "2026-10-28",
      to: "2026-10-28",
    });
    expect(pendingRange(null, "2026-10-28")).toBeNull();
    const range = pendingRange("2026-10-26", "2026-10-28");
    expect(inPendingRange("2026-10-27", range)).toBe(true);
    expect(inPendingRange("2026-10-29", range)).toBe(false);
    expect(inPendingRange(null, range)).toBe(false);
  });
});
