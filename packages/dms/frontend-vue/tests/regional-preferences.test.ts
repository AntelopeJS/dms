import { afterEach, describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from "../layers/dms-core/app/utils/formatter";
import {
  readRegionalPreferences,
  regionalDayKey,
  regionalDayNumber,
  regionalWeekStart,
  setRegionalPreferencesSource,
  withRegionalOptions,
} from "../layers/dms-core/app/utils/regional";
import {
  buildTimeZoneOptions,
  timeZoneLabel,
  timeZoneOffset,
} from "../layers/dms-layout/app/composables/settings/region/timeZones";
import { groupNotificationsByDay } from "../layers/dms-layout/app/build/components/pages/settings/notification/notificationDisplay";
import type { UserNotification } from "../layers/dms-layout/app/composables/notification/useNotifications";

// 23:30 UTC on 30 Sep: already 1 Oct in Brussels, still 30 Sep in New York.
const LATE_EVENING_UTC = new Date(Date.UTC(2026, 8, 30, 23, 30));

afterEach(() => {
  setRegionalPreferencesSource(() => ({}));
});

describe("readRegionalPreferences", () => {
  it("keeps the values this runtime can apply", () => {
    expect(
      readRegionalPreferences({
        timeZone: "Europe/Brussels",
        weekStart: 0,
        timeFormat: "h12",
        dateFormat: "numeric",
      }),
    ).toEqual({
      timeZone: "Europe/Brussels",
      weekStart: 0,
      timeFormat: "h12",
      dateFormat: "numeric",
    });
  });

  it("drops unknown zones and values as automatic", () => {
    expect(
      readRegionalPreferences({
        timeZone: "Mars/Olympus",
        weekStart: 3,
        timeFormat: "h24",
        dateFormat: null,
      }),
    ).toEqual({
      timeZone: undefined,
      weekStart: undefined,
      timeFormat: undefined,
      dateFormat: undefined,
    });
    expect(readRegionalPreferences(null)).toEqual({});
  });
});

describe("withRegionalOptions", () => {
  it("adds the zone and the clock, never over what the caller states", () => {
    const preferences = {
      timeZone: "Asia/Tokyo",
      timeFormat: "h12" as const,
    };
    expect(withRegionalOptions({ hour: "2-digit" }, {}, preferences)).toEqual({
      hour: "2-digit",
      timeZone: "Asia/Tokyo",
      hourCycle: "h12",
    });
    expect(
      withRegionalOptions(
        { hour: "2-digit", hour12: false, timeZone: "UTC" },
        {},
        preferences,
      ),
    ).toEqual({ hour: "2-digit", hour12: false, timeZone: "UTC" });
  });

  it("leaves the clock alone on a date without time", () => {
    expect(
      withRegionalOptions({ day: "numeric" }, {}, { timeFormat: "h12" }),
    ).toEqual({ day: "numeric" });
  });

  it("keeps the browser zone for calendar days", () => {
    expect(
      withRegionalOptions(
        { day: "numeric" },
        { keepLocalZone: true },
        { timeZone: "Asia/Tokyo" },
      ),
    ).toEqual({ day: "numeric" });
  });

  it("rewrites full dates to the chosen date format only", () => {
    const numeric = { dateFormat: "numeric" as const };
    expect(
      withRegionalOptions(
        { day: "2-digit", month: "long", year: "numeric" },
        {},
        numeric,
      ),
    ).toEqual({ day: "2-digit", month: "2-digit", year: "numeric" });
    expect(
      withRegionalOptions(
        { dateStyle: "medium", timeStyle: "short" },
        {},
        numeric,
      ),
    ).toEqual({
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    // "Sep 27" has no year: not a full date.
    expect(
      withRegionalOptions({ day: "numeric", month: "short" }, {}, numeric),
    ).toEqual({ day: "numeric", month: "short" });
    expect(
      withRegionalOptions(
        { day: "2-digit", month: "2-digit", year: "numeric" },
        {},
        { dateFormat: "text" },
      ),
    ).toEqual({ day: "2-digit", month: "short", year: "numeric" });
  });
});

describe("shared formatters follow the user's preferences", () => {
  it("writes dates and times in the chosen zone and clock", () => {
    setRegionalPreferencesSource(() => ({
      timeZone: "Europe/Brussels",
      timeFormat: "h12",
      dateFormat: "numeric",
    }));
    expect(formatDate(LATE_EVENING_UTC, "en-GB")).toBe("01/10/2026");
    expect(
      formatDateTime(LATE_EVENING_UTC, "en-GB", { second: undefined }),
    ).toMatch(/01\/10\/2026.*1:30.*am/i);

    setRegionalPreferencesSource(() => ({ timeZone: "America/New_York" }));
    expect(formatDate(LATE_EVENING_UTC, "en-GB")).toBe("30 September 2026");
  });

  it("counts days in the chosen zone", () => {
    const brussels = { timeZone: "Europe/Brussels" };
    const newYork = { timeZone: "America/New_York" };
    expect(
      regionalDayNumber(LATE_EVENING_UTC, brussels) -
        regionalDayNumber(LATE_EVENING_UTC, newYork),
    ).toBe(1);
    setRegionalPreferencesSource(() => brussels);
    expect(regionalDayKey(LATE_EVENING_UTC)).toBe("2026-10-01");
  });

  it("names yesterday in the chosen zone", () => {
    setRegionalPreferencesSource(() => ({ timeFormat: "h23" }));
    const t = (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoDaysAgo, t, "fr-FR")).toContain(
      "common.time.on_date",
    );
  });

  it("files notifications under the reader's day", () => {
    setRegionalPreferencesSource(() => ({ timeZone: "Europe/Brussels" }));
    const now = new Date(Date.UTC(2026, 9, 1, 8));
    const groups = groupNotificationsByDay(
      [{ createdAt: LATE_EVENING_UTC.toISOString() } as UserNotification],
      now,
    );
    expect(groups.map((group) => group.key)).toEqual(["today"]);
  });

  it("starts the week on the chosen day, else the locale's", () => {
    expect(regionalWeekStart("en", { weekStart: 0 })).toBe(0);
    expect(regionalWeekStart("fr", {})).toBe(1);
  });
});

describe("time zone picker entries", () => {
  it("labels and sorts zones by offset", () => {
    const at = new Date(Date.UTC(2026, 0, 15));
    expect(timeZoneLabel("America/Argentina/Buenos_Aires")).toBe(
      "America / Argentina / Buenos Aires",
    );
    expect(timeZoneOffset("UTC", at)).toBe("UTC+00:00");
    expect(timeZoneOffset("Asia/Kolkata", at)).toBe("UTC+05:30");
    const options = buildTimeZoneOptions(
      ["Asia/Tokyo", "UTC", "America/New_York"],
      at,
      ["UTC", ""],
    );
    expect(options.map((option) => option.value)).toEqual([
      "America/New_York",
      "UTC",
      "Asia/Tokyo",
    ]);
  });
});
