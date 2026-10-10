import { describe, expect, it } from "vitest";
import {
  formatActivityTime,
  formatShortDate,
  groupActivityByDay,
  activityText,
  resolveActivityParams,
  relativeDayBucket,
} from "../layers/dms-ui/app/build/components/activity-feed/activityFeedDays";

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
  it("makes a $ value a text of its own, with the entry's other values", () => {
    const count = { type: "count", value: 2 } as const;
    expect(
      resolveActivityParams({
        device: "$activity.device",
        browser: "Chrome",
        count,
      }),
    ).toEqual({
      device: {
        key: "$activity.device",
        params: { browser: "Chrome", count },
      },
      browser: "Chrome",
      count,
    });
  });

  it("gives nothing for an entry without values", () => {
    expect(resolveActivityParams(undefined)).toBeUndefined();
  });
});

describe("activityText", () => {
  it("gives a $ title the entry's values and leaves other texts alone", () => {
    expect(activityText("$a.title", { name: "Léa" })).toEqual({
      key: "$a.title",
      params: { name: "Léa" },
    });
    expect(activityText("Plain", { name: "Léa" })).toBe("Plain");
    const composed = { key: "a.composed" };
    expect(activityText(composed, { name: "Léa" })).toBe(composed);
  });
});

describe("shared day helpers", () => {
  it("files a day as today, earlier this week or older", () => {
    expect(relativeDayBucket(new Date(at(29, 8)), NOW)).toBe("today");
    expect(relativeDayBucket(new Date(at(23, 8)), NOW)).toBe("week");
    expect(relativeDayBucket(new Date(at(22, 8)), NOW)).toBe("older");
  });

  it("writes the year of a short date only when it is not this year's", () => {
    expect(formatShortDate(new Date(at(3, 9)), NOW, "en-GB")).toBe("3 Sept");
    expect(formatShortDate(new Date(at(3, 9, 11, 2025)), NOW, "en-GB")).toBe(
      "3 Dec 2025",
    );
  });
});
