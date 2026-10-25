/**
 * The agenda's zoned time math: day keys, wall-clock times of a zone turned
 * into instants and back, on a DST day (2026-10-25 in Europe/Brussels lasts
 * 25 hours, 2026-03-29 lasts 23) and in a zone that is not the browser's.
 */
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dayLengthMinutes,
  dayStartEpoch,
  daysBetween,
  endOfMonth,
  formatTimeOfDay,
  isDayKey,
  isoWeekOf,
  parseDay,
  parseInstant,
  parseTimeOfDay,
  startOfWeek,
  weekdayOf,
  zonedDayKey,
  zonedEpoch,
  zonedIso,
  zonedMinutes,
  zoneOffset,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTime";

const BRUSSELS = "Europe/Brussels";
const NEW_YORK = "America/New_York";
const HOUR = 3_600_000;

describe("day keys", () => {
  it("adds days and months across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("counts days whatever the DST changes between them", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-26", "2026-10-24")).toBe(-2);
  });

  it("knows the weekday, the week start and the ISO week", () => {
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(startOfWeek("2026-10-25", 1)).toBe("2026-10-19");
    expect(startOfWeek("2026-10-25", 0)).toBe("2026-10-25");
    expect(startOfWeek("2026-10-25", 6)).toBe("2026-10-24");
    expect(startOfWeek("2026-10-23", 6)).toBe("2026-10-17");
    expect(isoWeekOf("2026-09-28")).toBe(40);
    expect(isoWeekOf("2027-01-01")).toBe(53);
    expect(isoWeekOf("2026-01-01")).toBe(1);
  });

  it("refuses a day that does not exist", () => {
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-2-28")).toBe(false);
  });

  it("reads and writes times of day", () => {
    expect(parseTimeOfDay("07:30", 0)).toBe(450);
    expect(parseTimeOfDay("24:00", 0)).toBe(1440);
    expect(parseTimeOfDay("nope", 42)).toBe(42);
    expect(formatTimeOfDay(450)).toBe("07:30");
    expect(formatTimeOfDay(1440)).toBe("24:00");
  });
});

describe("Europe/Brussels on 2026-10-25 (fall back, 25 h)", () => {
  it("starts at midnight CEST and lasts 25 hours", () => {
    expect(dayStartEpoch("2026-10-25", BRUSSELS)).toBe(
      Date.parse("2026-10-24T22:00:00Z"),
    );
    expect(dayStartEpoch("2026-10-26", BRUSSELS)).toBe(
      Date.parse("2026-10-25T23:00:00Z"),
    );
    expect(dayLengthMinutes("2026-10-25", BRUSSELS)).toBe(1500);
    expect(dayLengthMinutes("2026-10-24", BRUSSELS)).toBe(1440);
  });

  it("reads 09:00 with the winter offset after the change", () => {
    expect(zonedEpoch("2026-10-25", 9 * 60, BRUSSELS)).toBe(
      Date.parse("2026-10-25T08:00:00Z"),
    );
    expect(zonedIso(Date.parse("2026-10-25T08:00:00Z"), BRUSSELS)).toBe(
      "2026-10-25T09:00:00+01:00",
    );
  });

  it("takes the first 02:30 of the repeated hour", () => {
    expect(zonedEpoch("2026-10-25", 150, BRUSSELS)).toBe(
      Date.parse("2026-10-25T00:30:00Z"),
    );
  });

  it("gives wall-clock minutes and days of instants around the change", () => {
    const first = Date.parse("2026-10-25T00:30:00Z");
    const second = first + HOUR;
    expect(zonedMinutes(first, BRUSSELS)).toBe(150);
    expect(zonedMinutes(second, BRUSSELS)).toBe(150);
    expect(zoneOffset(first, BRUSSELS)).toBe(2 * HOUR);
    expect(zoneOffset(second, BRUSSELS)).toBe(HOUR);
    expect(zonedDayKey(Date.parse("2026-10-25T22:59:59Z"), BRUSSELS)).toBe(
      "2026-10-25",
    );
    expect(zonedDayKey(Date.parse("2026-10-25T23:00:00Z"), BRUSSELS)).toBe(
      "2026-10-26",
    );
  });
});

describe("Europe/Brussels on 2026-03-29 (spring forward, 23 h)", () => {
  it("lasts 23 hours", () => {
    expect(dayLengthMinutes("2026-03-29", BRUSSELS)).toBe(1380);
  });

  it("moves a skipped 02:30 past the gap, to 03:30 CEST", () => {
    const epoch = zonedEpoch("2026-03-29", 150, BRUSSELS);
    expect(epoch).toBe(Date.parse("2026-03-29T01:30:00Z"));
    expect(zonedMinutes(epoch, BRUSSELS)).toBe(210);
  });
});

describe("America/New_York", () => {
  it("has its own DST day, a week after Brussels' (2026-11-01)", () => {
    expect(dayLengthMinutes("2026-10-25", NEW_YORK)).toBe(1440);
    expect(dayLengthMinutes("2026-11-01", NEW_YORK)).toBe(1500);
    expect(dayStartEpoch("2026-10-25", NEW_YORK)).toBe(
      Date.parse("2026-10-25T04:00:00Z"),
    );
  });

  it("reads one instant as another day and time than Brussels", () => {
    const epoch = Date.parse("2026-10-25T03:30:00Z");
    expect(zonedDayKey(epoch, NEW_YORK)).toBe("2026-10-24");
    expect(zonedMinutes(epoch, NEW_YORK)).toBe(23 * 60 + 30);
    expect(zonedDayKey(epoch, BRUSSELS)).toBe("2026-10-25");
    expect(zonedIso(epoch, NEW_YORK)).toBe("2026-10-24T23:30:00-04:00");
  });
});

describe("event bounds", () => {
  it("reads an ISO instant, or a bare day as its midnight in the zone", () => {
    expect(parseInstant("2026-10-25T09:00:00+01:00", BRUSSELS)).toBe(
      Date.parse("2026-10-25T08:00:00Z"),
    );
    expect(parseInstant("2026-10-25", NEW_YORK)).toBe(
      Date.parse("2026-10-25T04:00:00Z"),
    );
    expect(parseInstant("tomorrow", BRUSSELS)).toBeNull();
  });

  it("reads the day of an all-day bound given as an instant in the zone", () => {
    expect(parseDay("2026-10-25", BRUSSELS)).toBe("2026-10-25");
    expect(parseDay("2026-10-25T02:00:00Z", NEW_YORK)).toBe("2026-10-24");
  });
});
