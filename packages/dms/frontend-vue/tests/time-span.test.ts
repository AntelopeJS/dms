import { describe, expect, it } from "vitest";
import {
  formatDuration,
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
    expect(readTimeSpan(formatDuration(HOUR + 30 * MINUTE, "en"))).toBe(
      HOUR + 30 * MINUTE,
    );
  });

  it("reads hours then bare minutes, and a lone hour", () => {
    expect(readTimeSpan("8h15")).toBe(8 * HOUR + 15 * MINUTE);
    expect(readTimeSpan("8 h 05")).toBe(8 * HOUR + 5 * MINUTE);
    expect(readTimeSpan("8:15")).toBe(8 * HOUR + 15 * MINUTE);
    expect(readTimeSpan("08:15")).toBe(8 * HOUR + 15 * MINUTE);
    expect(readTimeSpan("8h")).toBe(8 * HOUR);
  });

  it("reads what the localized display writes back", () => {
    expect(readTimeSpan("7 h 30 min")).toBe(7 * HOUR + 30 * MINUTE);
    expect(readTimeSpan("1,5h")).toBe(HOUR + 30 * MINUTE);
    expect(readTimeSpan("7h:30m")).toBe(7 * HOUR + 30 * MINUTE);
  });

  it("writes a duration as people write it, in the reader's locale", () => {
    expect(formatDuration(7 * HOUR + 30 * MINUTE, "fr")).toBe("7 h 30 min");
    expect(formatDuration(HOUR + 15_500, "fr")).toBe("1 h 15,5 s");
    expect(formatDuration(0, "en")).toBe("0 ms");
    expect(formatDuration(-90 * MINUTE, "en")).toBe("-1 h 30 min");
  });

  // Every value the field shows is the value it holds: focusing the field
  // and leaving it rewrites nothing, whatever the locale.
  it("reads back exactly what it writes", () => {
    const durations = [
      0,
      1,
      999,
      1000,
      1800,
      59_999,
      61_001,
      252_345,
      HOUR,
      7 * HOUR + 30 * MINUTE + 15_250,
      1234 * HOUR + 5,
      -(2 * HOUR + 1),
    ];
    for (const locale of ["en-US", "fr-FR", "de-DE", "ar-EG", "hi-IN"]) {
      for (const ms of durations) {
        const text = formatDuration(ms, locale);
        expect(readTimeSpan(text), `${locale}: ${text}`).toBe(ms);
      }
    }
  });

  it("refuses anything else rather than reading it as nothing", () => {
    for (const text of ["abc", "01:75", "1h abc", "12", ":30", "1:2", "8h75"]) {
      expect(readTimeSpan(text), text).toBeUndefined();
    }
  });

  it("keeps parseTimeSpan's zero for what it cannot read", () => {
    expect(parseTimeSpan("abc")).toBe(0);
    expect(parseTimeSpan("01:30")).toBe(HOUR + 30 * MINUTE);
  });
});
