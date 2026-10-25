/**
 * The time grid's pure layout: overlapping events side by side or stacked,
 * the columns of a resources view (resources first, days first, a folded
 * group), its header rows, the pieces of an event per column (clipped to the
 * hours shown, across midnight, on the 25 h DST day) and the all-day bars.
 */
import { describe, expect, it } from "vitest";
import {
  buildGridColumns,
  buildGridHeaders,
  isAllDayRowItem,
  layoutAllDayRow,
  layoutOverlaps,
  timedSegment,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTimeGridLayout";
import type { AgendaResource } from "../layers/dms-ui/app/types/full-agenda";
import {
  agendaDay,
  agendaDays,
  occurrence,
} from "./fixtures/agendaOccurrences";

const item = (key: string, top: number, bottom: number) => ({
  key,
  top,
  bottom,
});

describe("overlap columns", () => {
  it("puts lone events at full width", () => {
    const boxes = layoutOverlaps(
      [item("a", 540, 600), item("b", 600, 660)],
      "columns",
    );
    expect(boxes.get("a")).toEqual({ left: 0, width: 1, z: 1 });
    expect(boxes.get("b")).toEqual({ left: 0, width: 1, z: 1 });
  });

  it("splits overlapping events into lanes, the longest first", () => {
    const boxes = layoutOverlaps(
      [item("short", 540, 570), item("long", 540, 660), item("late", 600, 630)],
      "columns",
    );
    expect(boxes.get("long")).toMatchObject({ left: 0, width: 0.5 });
    expect(boxes.get("short")).toMatchObject({ left: 0.5, width: 0.5 });
    // "late" reuses the lane "short" left free.
    expect(boxes.get("late")).toMatchObject({ left: 0.5, width: 0.5 });
  });

  it("widens an event into the free lanes on its right", () => {
    const boxes = layoutOverlaps(
      [
        item("a", 540, 720),
        item("b", 540, 600),
        item("c", 540, 600),
        item("d", 620, 700),
      ],
      "columns",
    );
    expect(boxes.get("a")).toMatchObject({ left: 0, width: 1 / 3 });
    expect(boxes.get("b")!.left).toBeCloseTo(1 / 3);
    expect(boxes.get("c")!.left).toBeCloseTo(2 / 3);
    // "d" sits in b's lane and nothing is beside it in c's lane any more.
    expect(boxes.get("d")!.left).toBeCloseTo(1 / 3);
    expect(boxes.get("d")!.width).toBeCloseTo(2 / 3);
  });

  it("lays out separate clusters on their own", () => {
    const boxes = layoutOverlaps(
      [item("a", 540, 600), item("b", 550, 610), item("c", 700, 760)],
      "columns",
    );
    expect(boxes.get("c")).toMatchObject({ left: 0, width: 1 });
  });
});

describe("overlap stack", () => {
  it("offsets each event over the ones it overlaps", () => {
    const boxes = layoutOverlaps(
      [
        item("a", 540, 720),
        item("b", 560, 620),
        item("c", 580, 600),
        item("d", 730, 760),
      ],
      "stack",
    );
    expect(boxes.get("a")).toEqual({ left: 0, width: 1, z: 1 });
    expect(boxes.get("b")!.left).toBeCloseTo(0.14);
    expect(boxes.get("c")!.left).toBeCloseTo(0.28);
    expect(boxes.get("c")!.z).toBe(3);
    expect(boxes.get("d")).toEqual({ left: 0, width: 1, z: 1 });
  });
});

const RESOURCES: AgendaResource[] = [
  { id: "ana", label: "Ana", group: "ne1" },
  { id: "bob", label: "Bob", group: "ne1" },
  { id: "cid", label: "Cid", group: "lg4" },
  { id: "dan", label: "Dan" },
];
const GROUPS = [
  { id: "ne1", label: "NE1" },
  { id: "lg4", label: "LG4" },
];

describe("grid columns and headers", () => {
  const days = agendaDays("2026-10-26", 2);

  it("draws a column per day without resources", () => {
    const columns = buildGridColumns({ days });
    expect(columns.map((column) => column.key)).toEqual([
      "2026-10-26",
      "2026-10-27",
    ]);
    expect(buildGridHeaders(columns, { days })).toHaveLength(1);
  });

  it("orders resources first, grouped, the ungrouped last", () => {
    const columns = buildGridColumns({
      days,
      resources: RESOURCES,
      groups: GROUPS,
    });
    expect(columns.map((column) => column.key)).toEqual([
      "ana|2026-10-26",
      "ana|2026-10-27",
      "bob|2026-10-26",
      "bob|2026-10-27",
      "cid|2026-10-26",
      "cid|2026-10-27",
      "dan|2026-10-26",
      "dan|2026-10-27",
    ]);
    const [groups, resources, dayRow] = buildGridHeaders(columns, {
      days,
      resources: RESOURCES,
    });
    expect(groups!.map((cell) => [cell.column.groupId, cell.span])).toEqual([
      ["ne1", 4],
      ["lg4", 2],
      [undefined, 2],
    ]);
    expect(resources!.map((cell) => cell.span)).toEqual([2, 2, 2, 2]);
    expect(dayRow).toHaveLength(8);
  });

  it("orders days first, each day holding every resource", () => {
    const columns = buildGridColumns({
      days,
      resources: RESOURCES,
      groups: GROUPS,
      layout: "daysFirst",
    });
    expect(columns.slice(0, 4).map((column) => column.key)).toEqual([
      "ana|2026-10-26",
      "bob|2026-10-26",
      "cid|2026-10-26",
      "dan|2026-10-26",
    ]);
    const [dayRow, groups] = buildGridHeaders(columns, {
      days,
      resources: RESOURCES,
      layout: "daysFirst",
    });
    expect(dayRow!.map((cell) => cell.span)).toEqual([4, 4]);
    // Groups repeat under each day.
    expect(groups!.map((cell) => cell.span)).toEqual([2, 1, 1, 2, 1, 1]);
  });

  it("folds a group into one placeholder column", () => {
    const columns = buildGridColumns({
      days,
      resources: RESOURCES,
      groups: GROUPS,
      folded: new Set(["ne1"]),
    });
    expect(columns[0]).toMatchObject({ folded: true, groupId: "ne1" });
    expect(columns).toHaveLength(5);
  });

  it("leaves the day row out of a one-day resources view", () => {
    const one = [agendaDay("2026-10-26")];
    const columns = buildGridColumns({
      days: one,
      resources: RESOURCES,
      groups: GROUPS,
    });
    const rows = buildGridHeaders(columns, { days: one, resources: RESOURCES });
    expect(rows.map((row) => row[0]!.kind)).toEqual(["group", "resource"]);
  });
});

describe("timed pieces", () => {
  const [monday, tuesday] = buildGridColumns({
    days: agendaDays("2026-10-26", 2),
  });

  it("clips an event to the hours shown and marks the cut", () => {
    const segment = timedSegment(
      occurrence("a", "2026-10-26T06:00", "2026-10-26T09:00"),
      monday!,
      420,
      1260,
      15,
    );
    expect(segment).toMatchObject({
      top: 420,
      bottom: 540,
      clippedStart: true,
      clippedEnd: false,
    });
  });

  it("keeps a sliver of an event wholly before the hours shown", () => {
    const segment = timedSegment(
      occurrence("a", "2026-10-26T05:00", "2026-10-26T06:00"),
      monday!,
      420,
      1260,
      15,
    );
    expect(segment).toMatchObject({ top: 420, bottom: 435 });
  });

  it("cuts an event across midnight into two pieces", () => {
    const night = occurrence("n", "2026-10-26T22:00", "2026-10-27T02:00");
    expect(timedSegment(night, monday!, 0, 1440, 15)).toMatchObject({
      top: 1320,
      bottom: 1440,
      clippedEnd: true,
    });
    expect(timedSegment(night, tuesday!, 0, 1440, 15)).toMatchObject({
      top: 0,
      bottom: 120,
      clippedStart: true,
    });
  });

  it("draws wall-clock hours on the 25 h DST day", () => {
    const [sunday] = buildGridColumns({ days: [agendaDay("2026-10-25")] });
    // 01:00 CEST to 04:00 CET is 4 h of real time, 3 h of wall clock.
    const event = occurrence("dst", "2026-10-25T01:00", "2026-10-25T04:00");
    expect((event.end - event.start) / 3_600_000).toBe(4);
    expect(timedSegment(event, sunday!, 0, 1440, 15)).toMatchObject({
      top: 60,
      bottom: 240,
    });
  });

  it("sends an event of 24 h or more to the all-day row", () => {
    expect(
      isAllDayRowItem(
        occurrence("long", "2026-10-26T09:00", "2026-10-27T09:00"),
      ),
    ).toBe(true);
    expect(
      timedSegment(
        occurrence("long", "2026-10-26T09:00", "2026-10-27T09:00"),
        monday!,
        0,
        1440,
        15,
      ),
    ).toBeNull();
  });

  it("keeps an event to the columns of its resources", () => {
    const columns = buildGridColumns({
      days: [agendaDay("2026-10-26")],
      resources: RESOURCES,
    });
    const event = occurrence("r", "2026-10-26T09:00", "2026-10-26T10:00", {
      resourceIds: ["bob"],
    });
    expect(
      columns.map(
        (column) => timedSegment(event, column, 0, 1440, 15) !== null,
      ),
    ).toEqual([false, true, false, false]);
  });
});

describe("all-day row", () => {
  it("packs multi-day bars into lanes over the columns", () => {
    const columns = buildGridColumns({ days: agendaDays("2026-10-26", 7) });
    const { bars, lanes } = layoutAllDayRow(
      [
        occurrence("leave", "2026-10-24", "2026-10-28"),
        occurrence("trip", "2026-10-27", "2026-10-29"),
        occurrence("fair", "2026-10-30", "2026-11-02"),
        occurrence("meeting", "2026-10-26T09:00", "2026-10-26T10:00"),
      ],
      columns,
    );
    expect(lanes).toBe(2);
    const byKey = Object.fromEntries(
      bars.map((bar) => [bar.occurrence.key, bar]),
    );
    expect(byKey.leave).toMatchObject({
      lane: 0,
      first: 0,
      last: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(byKey.trip).toMatchObject({ lane: 1, first: 1, last: 3 });
    expect(byKey.fair).toMatchObject({
      lane: 0,
      first: 4,
      last: 6,
      continuesAfter: true,
    });
    expect(byKey.meeting).toBeUndefined();
  });

  it("cuts a bar per resource block in a days-first grid", () => {
    const columns = buildGridColumns({
      days: agendaDays("2026-10-26", 2),
      resources: RESOURCES.slice(0, 2),
      layout: "daysFirst",
    });
    const { bars } = layoutAllDayRow(
      [occurrence("off", "2026-10-26", "2026-10-27", { resourceIds: ["ana"] })],
      columns,
    );
    expect(bars.map((bar) => [bar.first, bar.last])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });
});
