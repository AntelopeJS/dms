import { describe, expect, it } from "vitest";
import {
  formatActivityTime,
  groupActivityByDay,
  resolveActivityParams,
} from "../layers/dms-ui/app/components/activity-feed/activityFeedDays";

// Tuesday Sep 29, 2026, mid-morning, local time.
const NOW = new Date(2026, 8, 29, 10, 0);
const LABELS = { today: "Today", yesterday: "Yesterday" };

const at = (day: number, hour: number, month = 8, year = 2026) =>
  new Date(year, month, day, hour, 15).toISOString();

describe("activity feed day groups", () => {
  it("names today, yesterday, the weekday within the week, then the date", () => {
    const days = groupActivityByDay(
      [
        { title: "a", date: at(29, 9) },
        { title: "b", date: at(28, 17) },
        { title: "c", date: at(25, 16) },
        { title: "d", date: at(12, 8) },
      ],
      "en-GB",
      LABELS,
      NOW,
    );

    expect(days.map((day) => [day.name, day.date])).toEqual([
      ["Today", "29 Sept"],
      ["Yesterday", "28 Sept"],
      ["Friday", "25 Sept"],
      ["12 Sept", undefined],
    ]);
  });

  it("keeps the feed order and gathers same-day entries", () => {
    const days = groupActivityByDay(
      [
        { title: "late", date: at(29, 9) },
        { title: "early", date: at(29, 8) },
        { title: "before", date: at(28, 8) },
      ],
      "en-GB",
      LABELS,
      NOW,
    );

    expect(days).toHaveLength(2);
    expect(days[0]!.items.map((item) => item.title)).toEqual(["late", "early"]);
  });

  it("puts entries without a usable date last, under no heading", () => {
    const days = groupActivityByDay(
      [
        { title: "undated" },
        { title: "broken", date: "not a date" },
        { title: "dated", date: at(29, 9) },
      ],
      "en-GB",
      LABELS,
      NOW,
    );

    expect(days.map((day) => day.key)).toEqual(["2026-09-29", "undated"]);
    expect(days[1]!.name).toBeUndefined();
    expect(days[1]!.items).toHaveLength(2);
  });

  it("adds the year to a date from another year", () => {
    const [day] = groupActivityByDay(
      [{ title: "old", date: at(3, 9, 11, 2025) }],
      "en-GB",
      LABELS,
      NOW,
    );

    expect(day!.name).toBe("3 Dec 2025");
  });

  it("formats the time of an entry and ignores a broken date", () => {
    expect(formatActivityTime(at(29, 9), "en-GB")).toBe("09:15");
    expect(formatActivityTime("nope", "en-GB")).toBe("");
  });
});

describe("resolveActivityParams", () => {
  // Echoes the key and its values, so assertions read the whole text.
  const translate = (key: string, params?: Record<string, string> | null) =>
    `${key}(${JSON.stringify(params ?? {})})`;

  it("translates a $ value with the entry's literal values", () => {
    expect(
      resolveActivityParams(
        { device: "$activity.device", browser: "Chrome", os: "Windows" },
        translate,
      ),
    ).toEqual({
      device: '$activity.device({"browser":"Chrome","os":"Windows"})',
      browser: "Chrome",
      os: "Windows",
    });
  });

  it("gives nothing for an entry without values", () => {
    expect(resolveActivityParams(undefined, translate)).toBeNull();
  });
});
