/**
 * A PeriodSelector keeps its period in the page URL under keys prefixed with
 * its id. These cover what the URL holds: how a selection is written and read
 * back, which source wins (the URL, then the user's last choice, then the
 * default), that two selectors never read each other's keys, and that a value
 * the selector cannot honour falls back silently.
 */
import { describe, expect, it } from "vitest";
import {
  formatPeriodDate,
  isPeriodQueryCurrent,
  mergePeriodSearch,
  parsePeriodDate,
  periodQueryKeys,
  type PeriodChoices,
  type PeriodSelection,
  readComparisonChoice,
  isRangeOffered,
  readRangeChoice,
  rememberedPeriodKey,
  rememberPeriod,
  resolvePeriodSelection,
  writePeriodQuery,
} from "../layers/dms-ui/app/build/composables/period/periodQuery";

const CHOICES: PeriodChoices = {
  presets: ["last-7-days", "last-30-days", "this-month", "custom"],
  comparisons: ["none", "previous-period", "previous-year", "custom"],
};
const DEFAULT: PeriodSelection = {
  preset: "this-month",
  comparison: "none",
  customRange: null,
  customCompareRange: null,
};
const PAGE = periodQueryKeys("page");
const STORED = periodQueryKeys();

const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date);
const endOfDay = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date, 23, 59, 59, 999);

describe("the keys of a selector", () => {
  it("prefixes every key with the selector id", () => {
    expect(periodQueryKeys("page")).toEqual({
      period: "page.period",
      compare: "page.compare",
      from: "page.from",
      to: "page.to",
      compareFrom: "page.compareFrom",
      compareTo: "page.compareTo",
    });
  });

  it("keeps the bare keys without an id", () => {
    expect(periodQueryKeys().period).toBe("period");
  });
});

describe("serializing a selection", () => {
  it("writes a preset and its comparison", () => {
    expect(
      writePeriodQuery(
        { ...DEFAULT, preset: "last-7-days", comparison: "previous-period" },
        PAGE,
      ),
    ).toEqual({
      "page.period": "last-7-days",
      "page.compare": "previous-period",
    });
  });

  it("writes a custom range of whole days as bare dates", () => {
    expect(
      writePeriodQuery(
        {
          ...DEFAULT,
          preset: "custom",
          customRange: { from: day(2026, 10, 1), to: endOfDay(2026, 10, 31) },
        },
        PAGE,
      ),
    ).toEqual({
      "page.from": "2026-10-01",
      "page.to": "2026-10-31",
      "page.compare": "none",
    });
  });

  it("writes an instant that is not a day boundary as an ISO date-time", () => {
    const from = new Date(2026, 9, 1, 10, 30);
    expect(formatPeriodDate(from, "start")).toBe(from.toISOString());
  });

  it("writes a custom comparison with its own range", () => {
    expect(
      writePeriodQuery(
        {
          ...DEFAULT,
          comparison: "custom",
          customCompareRange: {
            from: day(2025, 10, 1),
            to: endOfDay(2025, 10, 31),
          },
        },
        PAGE,
      ),
    ).toEqual({
      "page.period": "this-month",
      "page.compare": "custom",
      "page.compareFrom": "2025-10-01",
      "page.compareTo": "2025-10-31",
    });
  });

  it("reads back what it wrote", () => {
    const selection: PeriodSelection = {
      preset: "custom",
      comparison: "custom",
      customRange: {
        from: new Date(2026, 9, 1, 8),
        to: new Date(2026, 9, 2, 18),
      },
      customCompareRange: { from: day(2026, 9, 1), to: endOfDay(2026, 9, 2) },
    };
    const query = writePeriodQuery(selection, PAGE);
    expect(
      resolvePeriodSelection([{ query, keys: PAGE }], CHOICES, DEFAULT),
    ).toEqual(selection);
    expect(isPeriodQueryCurrent(query, PAGE, selection)).toBe(true);
  });
});

describe("parsing the URL", () => {
  it("reads an ISO date as the start or the end of that local day", () => {
    expect(parsePeriodDate("2026-10-01", "start")).toEqual(day(2026, 10, 1));
    expect(parsePeriodDate("2026-10-01", "end")).toEqual(endOfDay(2026, 10, 1));
  });

  it("reads an ISO date-time as that instant", () => {
    expect(parsePeriodDate("2026-10-01T08:00:00.000Z", "start")).toEqual(
      new Date("2026-10-01T08:00:00.000Z"),
    );
  });

  it.each(["2026-02-30", "yesterday", "1700000000", "2026-13-01", ""])(
    "refuses %j",
    (text) => {
      expect(parsePeriodDate(text, "start")).toBeNull();
    },
  );

  it("reads a preset the selector offers", () => {
    const query = { "page.period": "last-30-days" };
    expect(readRangeChoice({ query, keys: PAGE }, CHOICES)).toEqual({
      preset: "last-30-days",
      customRange: null,
    });
  });

  it("prefers a custom range to a preset", () => {
    const query = {
      "page.period": "last-30-days",
      "page.from": "2026-10-01",
      "page.to": "2026-10-15",
    };
    expect(readRangeChoice({ query, keys: PAGE }, CHOICES)).toEqual({
      preset: "custom",
      customRange: { from: day(2026, 10, 1), to: endOfDay(2026, 10, 15) },
    });
  });

  it("takes the first value of a repeated key", () => {
    const query = { "page.period": ["last-7-days", "last-30-days"] };
    expect(readRangeChoice({ query, keys: PAGE }, CHOICES)?.preset).toBe(
      "last-7-days",
    );
  });

  it.each([
    ["an unknown preset", { "page.period": "last-decade" }],
    ["a preset the selector does not offer", { "page.period": "ytd" }],
    ["custom with no range", { "page.period": "custom" }],
    [
      "a range ending before it starts",
      { "page.from": "2026-10-15", "page.to": "2026-10-01" },
    ],
    ["half a range", { "page.from": "2026-10-01" }],
  ])("ignores %s", (_, query) => {
    expect(readRangeChoice({ query, keys: PAGE }, CHOICES)).toBeNull();
  });

  it("ignores a custom range the selector does not offer", () => {
    const query = { "page.from": "2026-10-01", "page.to": "2026-10-15" };
    const presets = CHOICES.presets.filter((preset) => preset !== "custom");
    expect(
      readRangeChoice({ query, keys: PAGE }, { ...CHOICES, presets }),
    ).toBeNull();
  });

  it("takes a linked range the selector does not offer, from a source that always accepts one", () => {
    const query = { "page.from": "2026-10-01", "page.to": "2026-10-15" };
    const choices = { ...CHOICES, presets: ["last-7-days" as const] };
    expect(
      readRangeChoice(
        { query, keys: PAGE, isRangeAlwaysAccepted: true },
        choices,
      ),
    ).toEqual({
      preset: "custom",
      customRange: { from: day(2026, 10, 1), to: endOfDay(2026, 10, 15) },
    });
    expect(
      isRangeOffered({ preset: "custom", customRange: null }, choices),
    ).toBe(false);
  });

  it.each([
    ["an unknown comparison", { "page.compare": "previous-decade" }],
    ["a custom comparison with no range", { "page.compare": "custom" }],
  ])("ignores %s", (_, query) => {
    expect(readComparisonChoice({ query, keys: PAGE }, CHOICES)).toBeNull();
  });
});

describe("the order of the sources", () => {
  const stored = {
    query: { period: "last-30-days", compare: "previous-year" },
    keys: STORED,
  };

  it("reads the URL first", () => {
    const url = {
      query: { "page.period": "last-7-days", "page.compare": "none" },
      keys: PAGE,
    };
    expect(
      resolvePeriodSelection([url, stored], CHOICES, DEFAULT),
    ).toMatchObject({ preset: "last-7-days", comparison: "none" });
  });

  it("reads the user's last choice when the URL names nothing", () => {
    expect(
      resolvePeriodSelection(
        [{ query: {}, keys: PAGE }, stored],
        CHOICES,
        DEFAULT,
      ),
    ).toMatchObject({ preset: "last-30-days", comparison: "previous-year" });
  });

  it("falls back to the default when no source names a period", () => {
    expect(
      resolvePeriodSelection(
        [
          { query: {}, keys: PAGE },
          { query: {}, keys: STORED },
        ],
        CHOICES,
        DEFAULT,
      ),
    ).toEqual(DEFAULT);
  });

  it("skips an invalid URL value for the next source, half by half", () => {
    const url = {
      query: {
        "page.period": "last-decade",
        "page.compare": "previous-period",
      },
      keys: PAGE,
    };
    expect(
      resolvePeriodSelection([url, stored], CHOICES, DEFAULT),
    ).toMatchObject({
      preset: "last-30-days",
      comparison: "previous-period",
    });
  });

  it("skips an invalid stored value for the default", () => {
    const broken = { query: { period: 42, compare: "?" }, keys: STORED };
    expect(
      resolvePeriodSelection(
        [{ query: {}, keys: PAGE }, broken],
        CHOICES,
        DEFAULT,
      ),
    ).toEqual(DEFAULT);
  });
});

describe("several selectors on one page", () => {
  const query = {
    "sales.period": "last-7-days",
    "sales.compare": "previous-year",
    "traffic.period": "last-30-days",
    "traffic.compare": "none",
    period: "this-month",
  };

  it("reads each selector's own keys only", () => {
    const read = (id: string) =>
      resolvePeriodSelection(
        [{ query, keys: periodQueryKeys(id) }],
        CHOICES,
        DEFAULT,
      );
    expect(read("sales")).toMatchObject({
      preset: "last-7-days",
      comparison: "previous-year",
    });
    expect(read("traffic")).toMatchObject({
      preset: "last-30-days",
      comparison: "none",
    });
    expect(read("other")).toEqual(DEFAULT);
  });

  it("rewrites one selector's keys and keeps every other parameter", () => {
    const search =
      "?requests.tab=get&sales.period=last-7-days&sales.compare=none&traffic.period=last-30-days";
    const next = mergePeriodSearch(search, periodQueryKeys("sales"), {
      ...DEFAULT,
      preset: "custom",
      customRange: { from: day(2026, 10, 1), to: endOfDay(2026, 10, 2) },
    });
    expect(Object.fromEntries(new URLSearchParams(next))).toEqual({
      "requests.tab": "get",
      "sales.compare": "none",
      "sales.from": "2026-10-01",
      "sales.to": "2026-10-02",
      "traffic.period": "last-30-days",
    });
  });
});

describe("the last choices kept in the browser", () => {
  it("keeps only the most recent ones", () => {
    let store = {};
    for (let index = 0; index < 25; index++) {
      store = rememberPeriod(store, `page-${index}#page`, { period: "ytd" });
    }
    const keys = Object.keys(store);
    expect(keys).toHaveLength(20);
    expect(keys[0]).toBe("page-5#page");
    expect(keys.at(-1)).toBe("page-24#page");
  });

  it("moves a selector chosen again to the most recent place", () => {
    const store = rememberPeriod(
      { "a#page": { period: "ytd" }, "b#page": { period: "ytd" } },
      "a#page",
      { period: "last-7-days" },
      2,
    );
    expect(Object.keys(store)).toEqual(["b#page", "a#page"]);
    expect(store["a#page"]).toEqual({ period: "last-7-days" });
    expect(
      Object.keys(rememberPeriod(store, "c#page", { period: "ytd" }, 2)),
    ).toEqual(["a#page", "c#page"]);
  });

  it("starts over from a store that is not an object", () => {
    expect(rememberPeriod("broken", "a#page", { period: "ytd" })).toEqual({
      "a#page": { period: "ytd" },
    });
  });
});

describe("every period", () => {
  const choices: PeriodChoices = { ...CHOICES, presets: ["last-24h", "all"] };

  it("is written as a preset with no bounds", () => {
    expect(writePeriodQuery({ ...DEFAULT, preset: "all" }, PAGE)).toEqual({
      "page.period": "all",
      "page.compare": "none",
    });
  });

  it("is read back when the selector offers it", () => {
    const query = { "page.period": "all" };
    expect(readRangeChoice({ query, keys: PAGE }, choices)).toEqual({
      preset: "all",
      customRange: null,
    });
    expect(readRangeChoice({ query, keys: PAGE }, CHOICES)).toBeNull();
  });
});

describe("the key a last choice is kept under", () => {
  it("is the page and the selector id by default", () => {
    expect(rememberedPeriodKey({ pageId: "logs", id: "api" })).toBe("logs#api");
  });

  it("is the shared key on every page carrying it", () => {
    const shared = (pageId: string) =>
      rememberedPeriodKey({ pageId, id: "api", rememberKey: "api" });
    expect(shared("logs")).toBe(shared("overview"));
    expect(shared("logs")).not.toContain("#");
  });
});
