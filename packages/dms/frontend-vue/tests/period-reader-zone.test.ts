/**
 * A server render resolves periods and writes dates in the time zone of the
 * browser it renders for (its `dms-time-zone` cookie), whatever the server's
 * own: the same bounds and the same text as the browser's, so hydration
 * matches. Without the cookie, or in the server's own zone, nothing changes.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  browserTimeZone,
  regionalDateTimeFormat,
  regionalDayKey,
  setReaderTimeZoneSource,
} from "../layers/dms-core/app/utils/regional";
import {
  localClock,
  zonedClock,
} from "../layers/dms-core/app/composables/period/periodClock";
import { resolvePresetRange } from "../layers/dms-core/app/composables/period/presetResolvers";
import { resolveComparisonRange } from "../layers/dms-core/app/composables/period/compareResolvers";
import {
  formatPeriodDate,
  parsePeriodDate,
} from "../layers/dms-ui/app/entries/composables/period/periodQuery";
import { formatPeriodRange } from "../layers/dms-ui/app/entries/composables/period/periodDisplay";

const READER_ZONE =
  browserTimeZone() === "Pacific/Kiritimati"
    ? "Etc/GMT+12"
    : "Pacific/Kiritimati";
const NEW_YORK = "America/New_York";
const NOW = new Date("2026-10-14T21:30:00.000Z");
const FALLBACK = { from: NOW, to: NOW };

function readFor(zone: string | null): void {
  setReaderTimeZoneSource(() => zone);
}

function inZone(zone: string, date: Date) {
  const { year, month, day, hours, minutes } = zonedClock(zone).wall(date);
  return `${year}-${month + 1}-${day} ${hours}:${minutes}`;
}

afterEach(() => readFor(null));

describe("the clock a period is resolved in", () => {
  it("reads and builds wall times in a zone, across a daylight saving change", () => {
    const clock = zonedClock(NEW_YORK);

    const midnight = clock.instant({
      year: 2026,
      month: 2,
      day: 8,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    expect(midnight.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    const evening = clock.instant({ ...clock.wall(midnight), hours: 23 });
    expect(evening.toISOString()).toBe("2026-03-09T03:00:00.000Z");

    const rolled = clock.wall(
      clock.instant({ ...clock.wall(midnight), month: 3, day: 0 }),
    );
    expect([rolled.month, rolled.day]).toEqual([2, 31]);
  });

  it("matches Date's own calendar in the zone the code runs in", () => {
    const local = zonedClock(browserTimeZone());
    expect(local.wall(NOW)).toEqual(localClock.wall(NOW));
    const wall = { ...localClock.wall(NOW), day: 40, hours: 0 };
    expect(local.instant(wall).getTime()).toBe(
      localClock.instant(wall).getTime(),
    );
  });
});

describe("a server render for a browser in another zone", () => {
  it("resolves presets and comparisons on the browser's calendar days", () => {
    readFor(READER_ZONE);
    const range = resolvePresetRange("this-month", NOW, FALLBACK)!;
    const reader = zonedClock(READER_ZONE);
    expect(inZone(READER_ZONE, range.from)).toMatch(/-1 0:0$/);
    expect(reader.wall(range.to).hours).toBe(23);
    expect(reader.wall(range.to).month).toBe(reader.wall(range.from).month);
    const previous = resolveComparisonRange("previous-year", range, null)!;
    expect(reader.wall(previous.from).year).toBe(
      reader.wall(range.from).year - 1,
    );
    expect(inZone(READER_ZONE, previous.from)).toMatch(/-1 0:0$/);
  });

  it("reads and writes the URL's days as the browser's", () => {
    readFor(READER_ZONE);
    const from = parsePeriodDate("2026-10-01", "start")!;
    expect(inZone(READER_ZONE, from)).toBe("2026-10-1 0:0");
    expect(formatPeriodDate(from, "start")).toBe("2026-10-01");
    expect(parsePeriodDate("2026-02-30", "start")).toBeNull();
  });

  it("writes the period's label and other dates in the browser's zone", () => {
    readFor(READER_ZONE);
    const range = resolvePresetRange("this-month", NOW, FALLBACK)!;
    const expected = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: READER_ZONE,
    }).format(range.from);
    expect(formatPeriodRange(range, "en")).toContain(expected);
    expect(
      regionalDateTimeFormat("en", { dateStyle: "medium" }).format(NOW),
    ).toBe(
      new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeZone: READER_ZONE,
      }).format(NOW),
    );
  });

  it("files dates under the browser's calendar days", () => {
    readFor(READER_ZONE);
    const { year, month, day } = zonedClock(READER_ZONE).wall(NOW);
    const pad = (value: number) => String(value).padStart(2, "0");
    expect(regionalDayKey(NOW)).toBe(`${year}-${pad(month + 1)}-${pad(day)}`);
  });

  it("changes nothing without the browser's zone, or in the server's own", () => {
    for (const zone of [null, browserTimeZone()]) {
      readFor(zone);
      const range = resolvePresetRange("this-month", NOW, FALLBACK)!;
      expect(range.from).toEqual(
        new Date(NOW.getFullYear(), NOW.getMonth(), 1),
      );
    }
  });
});
