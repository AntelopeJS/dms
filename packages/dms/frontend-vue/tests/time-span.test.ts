import { describe, expect, it } from "vitest";
import {
  formatTimeSpan,
  parseTimeSpan,
  readTimeSpan,
} from "../layers/dms-core/app/utils/formatter";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("time spans", () => {
  it("reads a clock duration, hours and minutes, seconds optional", () => {
    expect(readTimeSpan("01:30")).toBe(HOUR + 30 * MINUTE);
    expect(readTimeSpan("0:05")).toBe(5 * MINUTE);
    expect(readTimeSpan("26:00:30")).toBe(26 * HOUR + 30_000);
  });

  it("reads units, joined or split by spaces or the colon it writes", () => {
    expect(readTimeSpan("1h30m")).toBe(HOUR + 30 * MINUTE);
    expect(readTimeSpan("1h 30m")).toBe(HOUR + 30 * MINUTE);
    expect(readTimeSpan("1.5h")).toBe(HOUR + 30 * MINUTE);
    expect(readTimeSpan(formatTimeSpan(HOUR + 30 * MINUTE))).toBe(
      HOUR + 30 * MINUTE,
    );
  });

  it("refuses anything else rather than reading it as nothing", () => {
    for (const text of ["abc", "01:75", "1h abc", "12", ":30", "1:2"]) {
      expect(readTimeSpan(text), text).toBeUndefined();
    }
  });

  it("keeps parseTimeSpan's zero for what it cannot read", () => {
    expect(parseTimeSpan("abc")).toBe(0);
    expect(parseTimeSpan("01:30")).toBe(HOUR + 30 * MINUTE);
  });
});
