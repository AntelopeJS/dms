/**
 * The drag math of the FullAgenda: where a move, a resize, a range or a
 * pending item lands (snapping, grab point, slots over hidden days, the all-
 * day row, the DST day of 2026-10-25 in Brussels, another zone), and the
 * rules that refuse a drop. The pointer life cycle is agenda-drag-engine.
 */
import { describe, expect, it } from "vitest";
import type {
  AgendaBusinessHours,
  AgendaResource,
} from "../layers/dms-ui/app/types/full-agenda";
import { placeDrag } from "../layers/dms-ui/app/build/composables/agenda/agendaDragMath";
import type { AgendaDragConfig } from "../layers/dms-ui/app/build/composables/agenda/agendaDragBasics";
import { checkDrop } from "../layers/dms-ui/app/build/composables/agenda/agendaDragRules";
import type { AgendaDropRules } from "../layers/dms-ui/app/build/composables/agenda/agendaDragRules";
import { placementPatch } from "../layers/dms-ui/app/build/composables/agenda/agendaDragChange";
import { zonedEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { BRUSSELS, occurrence } from "./fixtures/agendaOccurrences";

const iso = (ms: number) => new Date(ms).toISOString();
const at = (day: string, time: string, timeZone = BRUSSELS) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return zonedEpoch(day, hours * 60 + minutes, timeZone);
};

const CONFIG: AgendaDragConfig = {
  timeZone: BRUSSELS,
  snapMinutes: 15,
  slots: [],
  hiddenDays: [],
  defaultDurationMinutes: 60,
  dayDropMinutes: 480,
  minDurationMinutes: 15,
};

describe("moving", () => {
  const meeting = occurrence("m", "2026-10-26T09:10", "2026-10-26T10:10");

  it("keeps the grab point and snaps the move, not the start", () => {
    const placement = placeDrag(
      {
        kind: "move",
        occurrence: meeting,
        origin: { day: "2026-10-26", minutes: 560 },
      },
      { day: "2026-10-27", minutes: 637 },
      CONFIG,
    );
    // 77 min later snaps to 75: 09:10 → 10:25 the next day, one hour long.
    expect(placement.start).toBe(at("2026-10-27", "10:25"));
    expect(placement.end - placement.start).toBe(3_600_000);
  });

  it("moves into the DST day by calendar days, not by 24 h", () => {
    const saturday = occurrence("s", "2026-10-24T10:00", "2026-10-24T11:00");
    const placement = placeDrag(
      { kind: "move", occurrence: saturday, origin: { day: "2026-10-24" } },
      { day: "2026-10-25" },
      CONFIG,
    );
    // 10:00 CET on Sunday is 09:00 UTC (it was 08:00 UTC on Saturday, CEST).
    expect(iso(placement.start)).toBe("2026-10-25T09:00:00.000Z");
    expect(iso(placement.end)).toBe("2026-10-25T10:00:00.000Z");
    expect(placementPatch(placement, BRUSSELS)).toMatchObject({
      start: "2026-10-25T10:00:00+01:00",
      end: "2026-10-25T11:00:00+01:00",
    });
  });

  it("lands on the first pass of the hour the DST change repeats", () => {
    const placement = placeDrag(
      {
        kind: "move",
        occurrence: meeting,
        origin: { day: "2026-10-26", minutes: 550 },
      },
      { day: "2026-10-25", minutes: 160 },
      CONFIG,
    );
    // 09:10 + (160 − 550) → 02:40, still summer time.
    expect(iso(placement.start)).toBe("2026-10-25T00:40:00.000Z");
    expect(placementPatch(placement, BRUSSELS).start).toBe(
      "2026-10-25T02:40:00+02:00",
    );
  });

  it("works in a zone other than the browser's", () => {
    const tokyo = occurrence("t", "2026-10-26T09:00", "2026-10-26T10:00", {
      timeZone: "Asia/Tokyo",
    });
    const placement = placeDrag(
      {
        kind: "move",
        occurrence: tokyo,
        origin: { day: "2026-10-26", minutes: 540 },
      },
      { day: "2026-10-26", minutes: 600 },
      { ...CONFIG, timeZone: "Asia/Tokyo" },
    );
    expect(iso(placement.start)).toBe("2026-10-26T01:00:00.000Z");
  });

  it("swaps the grabbed resource for the hovered one", () => {
    const shared = occurrence("r", "2026-10-26T09:00", "2026-10-26T10:00", {
      resourceIds: ["ana", "bob"],
    });
    const placement = placeDrag(
      {
        kind: "move",
        occurrence: shared,
        origin: { day: "2026-10-26", minutes: 540, resourceId: "bob" },
      },
      { day: "2026-10-26", minutes: 540, resourceId: "cid" },
      CONFIG,
    );
    expect(placement.resourceIds).toEqual(["ana", "cid"]);
  });
});

describe("moving between kinds of targets", () => {
  const meeting = occurrence("m", "2026-10-26T09:10", "2026-10-26T10:10");

  it("turns a timed event dropped on the all-day row into an all-day one, and back", () => {
    const toRow = placeDrag(
      {
        kind: "move",
        occurrence: meeting,
        origin: { day: "2026-10-26", minutes: 560 },
      },
      { day: "2026-10-28", asAllDay: true },
      CONFIG,
    );
    expect(toRow).toMatchObject({
      allDay: true,
      start: at("2026-10-28", "00:00"),
      end: at("2026-10-29", "00:00"),
    });
    const leave = occurrence("l", "2026-10-26", "2026-10-27");
    const shifted = placeDrag(
      {
        kind: "move",
        occurrence: leave,
        origin: { day: "2026-10-26", asAllDay: true },
      },
      { day: "2026-10-28", asAllDay: true },
      CONFIG,
    );
    expect(placementPatch(shifted, BRUSSELS)).toMatchObject({
      start: "2026-10-28",
      end: "2026-10-29",
      allDay: true,
    });
    const toGrid = placeDrag(
      {
        kind: "move",
        occurrence: leave,
        origin: { day: "2026-10-26", asAllDay: true },
      },
      { day: "2026-10-27", minutes: 845 },
      CONFIG,
    );
    expect(toGrid).toMatchObject({
      allDay: false,
      start: at("2026-10-27", "14:00"),
      end: at("2026-10-27", "15:00"),
    });
  });

  it("keeps the time of day over a month cell", () => {
    const placement = placeDrag(
      { kind: "move", occurrence: meeting, origin: { day: "2026-10-26" } },
      { day: "2026-10-30" },
      CONFIG,
    );
    expect(placement.start).toBe(at("2026-10-30", "09:10"));
  });
});

describe("resizing", () => {
  const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00");

  it("snaps the end and keeps the shortest length", () => {
    const longer = placeDrag(
      { kind: "resizeEnd", occurrence: meeting, origin: null },
      { day: "2026-10-26", minutes: 688 },
      CONFIG,
    );
    expect(longer.end).toBe(at("2026-10-26", "11:30"));
    const inverted = placeDrag(
      { kind: "resizeEnd", occurrence: meeting, origin: null },
      { day: "2026-10-26", minutes: 480 },
      CONFIG,
    );
    expect(inverted.end - inverted.start).toBe(15 * 60_000);
  });

  it("stops at the longest length allowed", () => {
    const placement = placeDrag(
      { kind: "resizeEnd", occurrence: meeting, origin: null },
      { day: "2026-10-26", minutes: 1080 },
      { ...CONFIG, maxDurationMinutes: 240 },
    );
    expect(placement.end).toBe(at("2026-10-26", "13:00"));
  });

  it("moves the start of an all-day event, never past its end", () => {
    const leave = occurrence("l", "2026-10-26", "2026-10-28");
    const placement = placeDrag(
      { kind: "resizeStart", occurrence: leave, origin: null },
      { day: "2026-10-30" },
      CONFIG,
    );
    expect(placementPatch(placement, BRUSSELS)).toMatchObject({
      start: "2026-10-28",
      end: "2026-10-28",
    });
  });
});

describe("ranges and pending items", () => {
  it("picks the cells from the press to the pointer, either way", () => {
    const down = placeDrag(
      { kind: "create", origin: { day: "2026-10-26", minutes: 545 } },
      { day: "2026-10-26", minutes: 620 },
      CONFIG,
    );
    const up = placeDrag(
      { kind: "create", origin: { day: "2026-10-26", minutes: 620 } },
      { day: "2026-10-26", minutes: 545 },
      CONFIG,
    );
    expect([down.start, down.end]).toEqual([
      at("2026-10-26", "09:00"),
      at("2026-10-26", "10:30"),
    ]);
    expect(up).toEqual(down);
  });

  it("picks whole days over day cells", () => {
    const placement = placeDrag(
      { kind: "select", origin: { day: "2026-10-29" } },
      { day: "2026-10-27" },
      CONFIG,
    );
    expect(placementPatch(placement, BRUSSELS)).toMatchObject({
      start: "2026-10-27",
      end: "2026-10-29",
      allDay: true,
    });
  });

  it("drops a timed item on a day cell at the opening time", () => {
    const placement = placeDrag(
      {
        kind: "external",
        item: { id: "x", title: "X", durationMinutes: 90 },
        origin: null,
      },
      { day: "2026-10-27" },
      CONFIG,
    );
    expect([placement.start, placement.end]).toEqual([
      at("2026-10-27", "08:00"),
      at("2026-10-27", "09:30"),
    ]);
  });
});

const HOURS: AgendaBusinessHours[] = [
  { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
];

function rules(extra: Partial<AgendaDropRules> = {}): AgendaDropRules {
  return {
    timeZone: BRUSSELS,
    constraints: {},
    resources: new Map(),
    businessHours: [],
    hoursOn: (weekday) => HOURS.filter((hours) => hours.days.includes(weekday)),
    backgrounds: [],
    occurrences: [],
    ...extra,
  };
}

const timed = (start: string, end: string, resourceIds: string[] = []) => ({
  start: at(start.slice(0, 10), start.slice(11)),
  end: at(end.slice(0, 10), end.slice(11)),
  allDay: false,
  resourceIds,
});

describe("rules", () => {
  const check = (
    placement: ReturnType<typeof timed>,
    extra: Partial<Parameters<typeof checkDrop>[0]> = {},
  ) => ({
    placement,
    copy: false,
    checkDuration: true,
    ...extra,
  });

  it("keeps a drop inside the business hours under withinBusinessHours", () => {
    const within = rules({
      constraints: { withinBusinessHours: true },
      businessHours: HOURS,
    });
    expect(
      checkDrop(check(timed("2026-10-26T09:00", "2026-10-26T10:00")), within),
    ).toBeNull();
    expect(
      checkDrop(check(timed("2026-10-26T08:00", "2026-10-26T10:00")), within),
    ).toBe("outsideHours");
    expect(
      checkDrop(check(timed("2026-10-25T10:00", "2026-10-25T11:00")), within),
    ).toBe("closed");
    expect(
      checkDrop(check(timed("2026-10-26T08:00", "2026-10-26T10:00")), rules()),
    ).toBeNull();
  });

  it("refuses a closed background under withinBusinessHours", () => {
    const closed = rules({
      constraints: { withinBusinessHours: true },
      backgrounds: [
        { start: "2026-10-27", kind: "closed", resourceIds: ["ana"] },
      ],
    });
    expect(
      checkDrop(
        check(timed("2026-10-27T10:00", "2026-10-27T11:00", ["ana"])),
        closed,
      ),
    ).toBe("closed");
    expect(
      checkDrop(
        check(timed("2026-10-27T10:00", "2026-10-27T11:00", ["bob"])),
        closed,
      ),
    ).toBeNull();
  });
});

describe("rules on resources and lengths", () => {
  const check = (
    placement: ReturnType<typeof timed>,
    extra: Partial<Parameters<typeof checkDrop>[0]> = {},
  ) => ({
    placement,
    copy: false,
    checkDuration: true,
    ...extra,
  });

  it("refuses an overlap on the same resource, the moved event aside", () => {
    const shift = occurrence("s", "2026-10-26T09:00", "2026-10-26T12:00", {
      resourceIds: ["ana"],
    });
    const resources = new Map<string, AgendaResource>([
      ["ana", { id: "ana", label: "Ana" }],
      ["bob", { id: "bob", label: "Bob" }],
    ]);
    const noOverlap = rules({
      constraints: { allowOverlap: false },
      occurrences: [shift],
      resources,
    });
    expect(
      checkDrop(
        check(timed("2026-10-26T11:00", "2026-10-26T13:00", ["ana"])),
        noOverlap,
      ),
    ).toBe("overlap");
    expect(
      checkDrop(
        check(timed("2026-10-26T11:00", "2026-10-26T13:00", ["bob"])),
        noOverlap,
      ),
    ).toBeNull();
    expect(
      checkDrop(
        check(timed("2026-10-26T10:00", "2026-10-26T13:00", ["ana"]), {
          occurrence: shift,
        }),
        noOverlap,
      ),
    ).toBeNull();
    expect(
      checkDrop(
        check(timed("2026-10-26T10:00", "2026-10-26T13:00", ["ana"]), {
          occurrence: shift,
          copy: true,
        }),
        noOverlap,
      ),
    ).toBe("overlap");
  });

  it("refuses read-only and not allowed resources", () => {
    const resources = new Map<string, AgendaResource>([
      ["lux", { id: "lux", label: "LUX29", editable: false }],
    ]);
    expect(
      checkDrop(
        check(timed("2026-10-26T09:00", "2026-10-26T10:00", ["lux"])),
        rules({ resources }),
      ),
    ).toBe("resourceReadOnly");
    expect(
      checkDrop(
        check(timed("2026-10-26T09:00", "2026-10-26T10:00", ["ana"]), {
          allowedResourceIds: ["bob"],
        }),
        rules(),
      ),
    ).toBe("resourceNotAllowed");
  });

  it("checks the length of a new event and the dates navigation stops at", () => {
    const limits = rules({
      constraints: { minDurationMinutes: 30, maxDurationMinutes: 120 },
      minDate: "2026-10-26",
    });
    expect(
      checkDrop(check(timed("2026-10-26T09:00", "2026-10-26T09:15")), limits),
    ).toBe("tooShort");
    expect(
      checkDrop(check(timed("2026-10-26T09:00", "2026-10-26T12:00")), limits),
    ).toBe("tooLong");
    expect(
      checkDrop(
        check(timed("2026-10-26T09:00", "2026-10-26T12:00"), {
          checkDuration: false,
        }),
        limits,
      ),
    ).toBeNull();
    expect(
      checkDrop(check(timed("2026-10-25T09:00", "2026-10-25T10:00")), limits),
    ).toBe("outOfRange");
  });
});
