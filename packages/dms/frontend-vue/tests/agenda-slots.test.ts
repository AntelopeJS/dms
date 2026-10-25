import { describe, expect, it } from "vitest";
import {
  addSlots,
  countSlots,
  parseSlots,
  shiftShownDay,
  slotEpochRange,
  slotIndexAt,
  slotPositionOf,
  slotSpan,
  zonedWallClock,
} from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import { zonedEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { BRUSSELS } from "./agenda-view-fixtures";

const HOUR = 3_600_000;
const QUARTER_DAYS = parseSlots([
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
]);
const WEEKEND = [0, 6];

describe("agenda zoned time", () => {
  it("knows the 25-hour day of 2026-10-25 in Brussels", () => {
    const midnight = zonedEpoch("2026-10-25", 0, BRUSSELS);
    expect(new Date(midnight).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(zonedEpoch("2026-10-26", 0, BRUSSELS) - midnight).toBe(25 * HOUR);
    // 10:00 CET is 11 hours after midnight CEST.
    expect(zonedEpoch("2026-10-25", 600, BRUSSELS) - midnight).toBe(11 * HOUR);
    // The repeated 02:00 takes its first (summer) occurrence.
    expect(
      new Date(zonedEpoch("2026-10-25", 120, BRUSSELS)).toISOString(),
    ).toBe("2026-10-25T00:00:00.000Z");
    expect(
      zonedWallClock(Date.parse("2026-10-25T01:30:00Z"), BRUSSELS),
    ).toEqual({
      day: "2026-10-25",
      minutes: 150,
    });
  });

  it("works in a zone other than the browser's", () => {
    const tokyo = zonedEpoch("2026-10-25", 9 * 60, "Asia/Tokyo");
    expect(new Date(tokyo).toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(zonedWallClock(tokyo, "America/New_York")).toEqual({
      day: "2026-10-24",
      minutes: 20 * 60,
    });
  });
});

describe("agenda slots", () => {
  it("orders slots and finds the slot of a time", () => {
    expect(QUARTER_DAYS.map((slot) => slot.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
    ]);
    expect(slotIndexAt(9 * 60, QUARTER_DAYS)).toBe(0);
    expect(slotIndexAt(12 * 60 + 30, QUARTER_DAYS)).toBe(-1);
    expect(slotIndexAt(16 * 60 + 59, QUARTER_DAYS)).toBe(3);
  });

  it("puts a time between slots in the next slot, after the last on the next shown day", () => {
    const lunch = Date.parse("2026-10-23T12:30:00+02:00");
    expect(slotPositionOf(lunch, QUARTER_DAYS, BRUSSELS, WEEKEND)).toEqual({
      day: "2026-10-23",
      slotIndex: 2,
    });
    const fridayEvening = Date.parse("2026-10-23T18:00:00+02:00");
    expect(
      slotPositionOf(fridayEvening, QUARTER_DAYS, BRUSSELS, WEEKEND),
    ).toEqual({
      day: "2026-10-26",
      slotIndex: 0,
    });
    const sunday = Date.parse("2026-10-25T10:00:00+01:00");
    expect(slotPositionOf(sunday, QUARTER_DAYS, BRUSSELS, WEEKEND)).toEqual({
      day: "2026-10-26",
      slotIndex: 0,
    });
  });

  it("adds slots across days, skipping hidden days", () => {
    const start = { day: "2026-10-22", slotIndex: 2 };
    expect(addSlots(start, 5, 4, WEEKEND)).toEqual({
      day: "2026-10-23",
      slotIndex: 3,
    });
    expect(
      addSlots({ day: "2026-10-23", slotIndex: 2 }, 2, 4, WEEKEND),
    ).toEqual({
      day: "2026-10-26",
      slotIndex: 0,
    });
    expect(
      addSlots({ day: "2026-10-26", slotIndex: 0 }, -1, 4, WEEKEND),
    ).toEqual({
      day: "2026-10-23",
      slotIndex: 3,
    });
    expect(shiftShownDay("2026-10-23", 1, WEEKEND)).toBe("2026-10-26");
  });

  it("spills a six-slot task starting on S3 over the next day", () => {
    const span = slotSpan(
      { day: "2026-10-22", slotIndex: 2 },
      6,
      QUARTER_DAYS,
      BRUSSELS,
      WEEKEND,
    );
    expect(new Date(span.start).toISOString()).toBe("2026-10-22T11:00:00.000Z");
    expect(new Date(span.end).toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(countSlots(span, QUARTER_DAYS, BRUSSELS, WEEKEND)).toBe(6);
  });

  it("spills over a hidden weekend and the DST change", () => {
    const span = slotSpan(
      { day: "2026-10-23", slotIndex: 2 },
      6,
      QUARTER_DAYS,
      BRUSSELS,
      WEEKEND,
    );
    // Friday 13:00 CEST to Monday 17:00 CET.
    expect(new Date(span.start).toISOString()).toBe("2026-10-23T11:00:00.000Z");
    expect(new Date(span.end).toISOString()).toBe("2026-10-26T16:00:00.000Z");
    expect(countSlots(span, QUARTER_DAYS, BRUSSELS, WEEKEND)).toBe(6);
  });

  it("gives a slot's instants on the DST day", () => {
    const s1 = slotEpochRange(
      { day: "2026-10-25", slotIndex: 0 },
      QUARTER_DAYS,
      BRUSSELS,
    );
    expect(new Date(s1.start).toISOString()).toBe("2026-10-25T07:00:00.000Z");
    expect(s1.end - s1.start).toBe(2 * HOUR);
  });
});
