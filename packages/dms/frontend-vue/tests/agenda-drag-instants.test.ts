/**
 * Drag round 2: a resize on a timeline by hour snaps again (N1), ranges and
 * pending drops keep the instant of the repeated DST hour (N14), Alt+↓ in
 * that hour goes forwards (N22), slot resizes keep at least one slot and
 * an all-day event stays all-day on a slot timeline (N12), a placement on no
 * resource only clashes with events on no resource (N3), and Undo of an
 * event stored without an end clears it (N16).
 */
import { describe, expect, it } from "vitest";
import type { AgendaOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { placeDrag } from "../layers/dms-ui/app/build/composables/agenda/agendaDragMath";
import type { AgendaDragConfig } from "../layers/dms-ui/app/build/composables/agenda/agendaDragBasics";
import { snapInstant } from "../layers/dms-ui/app/build/composables/agenda/agendaDragBasics";
import {
  AGENDA_KEY_STEPS,
  nudgeSource,
  nudgeTarget,
} from "../layers/dms-ui/app/build/composables/agenda/agendaDragKeys";
import { checkDrop } from "../layers/dms-ui/app/build/composables/agenda/agendaDragRules";
import { placementChange } from "../layers/dms-ui/app/build/composables/agenda/agendaDragChange";
import { parseSlots } from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import { buildTimelineColumns } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineLayout";
import { timelineTargetAt } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineHitTest";
import { zonedEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { BRUSSELS, agendaDays, occurrence } from "./fixtures/agendaOccurrences";

const at = (day: string, time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return zonedEpoch(day, hours * 60 + minutes, BRUSSELS);
};
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

const SLOTS = parseSlots([
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
]);

const CONFIG: AgendaDragConfig = {
  timeZone: BRUSSELS,
  snapMinutes: 15,
  slots: [],
  hiddenDays: [],
  defaultDurationMinutes: 60,
  dayDropMinutes: 480,
  minDurationMinutes: 15,
};
const SLOT_CONFIG: AgendaDragConfig = {
  ...CONFIG,
  slots: SLOTS,
  hiddenDays: [0, 6],
};

/** Real targets of a timeline by hour, as its surface resolves them (no snap). */
function hourTargets(from: string, count: number) {
  const columns = buildTimelineColumns({
    days: agendaDays(from, count),
    scale: "hour",
    slots: [],
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    timeZone: BRUSSELS,
  });
  return (epoch: number) => {
    const index = columns.findIndex(
      (column) => column.start <= epoch && epoch < column.end,
    );
    const column = columns[index]!;
    return timelineTargetAt({
      columns,
      position: index + (epoch - column.start) / (column.end - column.start),
      scale: "hour",
      resourceId: null,
      snapMinutes: 1,
      timeZone: BRUSSELS,
    })!;
  };
}

describe("instants on a timeline by hour (N1, N14)", () => {
  const over = hourTargets("2026-10-25", 2);

  it("snaps a resized end and start to the quarter hour", () => {
    const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00");
    const end = (time: string) =>
      placeDrag(
        { kind: "resizeEnd", occurrence: meeting, origin: null },
        over(at("2026-10-26", time)),
        CONFIG,
      ).end;
    expect(end("10:37")).toBe(at("2026-10-26", "10:30"));
    expect(end("10:43")).toBe(at("2026-10-26", "10:45"));
    const start = placeDrag(
      { kind: "resizeStart", occurrence: meeting, origin: null },
      over(at("2026-10-26", "08:22")),
      CONFIG,
    ).start;
    expect(start).toBe(at("2026-10-26", "08:15"));
  });

  it("creates in the second 02:xx of 2026-10-25 when picked there", () => {
    // 02:10 and 02:40 CET, the second pass: 01:10Z and 01:40Z.
    const placement = placeDrag(
      { kind: "create", origin: over(Date.parse("2026-10-25T01:10:00Z")) },
      over(Date.parse("2026-10-25T01:40:00Z")),
      CONFIG,
    );
    expect(iso(placement.start)).toBe("2026-10-25T01:00:00.000Z");
    expect(iso(placement.end)).toBe("2026-10-25T01:45:00.000Z");
  });

  it("drops a pending item in the second 02:xx", () => {
    const placement = placeDrag(
      {
        kind: "external",
        item: { id: "p", title: "P", durationMinutes: 30 },
        origin: null,
      },
      over(Date.parse("2026-10-25T01:20:00Z")),
      CONFIG,
    );
    expect(iso(placement.start)).toBe("2026-10-25T01:15:00.000Z");
  });
});

describe("Alt+↓ in the repeated hour (N22)", () => {
  it("moves the second 02:30 to the second 02:45, forwards", () => {
    const second: AgendaOccurrence = {
      ...occurrence("d", "2026-10-25T02:30", "2026-10-25T03:00"),
      start: Date.parse("2026-10-25T01:30:00Z"),
      end: Date.parse("2026-10-25T02:00:00Z"),
    };
    const context = {
      snapMinutes: 15,
      hiddenDays: [],
      timeZone: BRUSSELS,
      slots: [],
    };
    const step = AGENDA_KEY_STEPS.ArrowDown!;
    const placement = placeDrag(
      nudgeSource(second, false, context),
      nudgeTarget(second, step, false, context),
      CONFIG,
    );
    expect(iso(placement.start)).toBe("2026-10-25T01:45:00.000Z");
  });
});

describe("slot resizes keep a slot (N12)", () => {
  const slot = (day: string, slotIndex: number) => ({
    day,
    slotIndex,
    minutes: SLOTS[slotIndex]!.startMinutes,
  });
  const s1 = occurrence("s1", "2026-10-26T08:00", "2026-10-26T10:00");
  const s3 = occurrence("s3", "2026-10-26T13:00", "2026-10-26T15:00");

  it("does not move a start past the event's last slot, nor an end before its first", () => {
    const start = placeDrag(
      { kind: "resizeStart", occurrence: s1, origin: null },
      slot("2026-10-26", 1),
      SLOT_CONFIG,
    );
    expect([start.start, start.end]).toEqual([
      at("2026-10-26", "08:00"),
      at("2026-10-26", "10:00"),
    ]);
    const end = placeDrag(
      { kind: "resizeEnd", occurrence: s3, origin: null },
      slot("2026-10-26", 0),
      SLOT_CONFIG,
    );
    expect([end.start, end.end]).toEqual([
      at("2026-10-26", "13:00"),
      at("2026-10-26", "15:00"),
    ]);
  });

  it("steps the end by whole slots from the keyboard", () => {
    const context = {
      snapMinutes: 15,
      hiddenDays: [0, 6],
      timeZone: BRUSSELS,
      slots: SLOTS,
    };
    const resize = (item: AgendaOccurrence, key: string) =>
      placeDrag(
        nudgeSource(item, true, context),
        nudgeTarget(item, AGENDA_KEY_STEPS[key]!, true, context),
        SLOT_CONFIG,
      ).end;
    expect(resize(s1, "ArrowUp")).toBe(at("2026-10-26", "10:00"));
    const lunch = occurrence("l", "2026-10-26T10:00", "2026-10-26T12:30");
    expect(resize(lunch, "ArrowDown")).toBe(at("2026-10-26", "15:00"));
  });

  it("keeps an all-day event all-day on a slot timeline", () => {
    const leave = occurrence("leave", "2026-10-26", "2026-10-27");
    const placement = placeDrag(
      { kind: "move", occurrence: leave, origin: slot("2026-10-26", 0) },
      slot("2026-10-28", 2),
      SLOT_CONFIG,
    );
    expect(placement).toMatchObject({
      allDay: true,
      start: at("2026-10-28", "00:00"),
      end: at("2026-10-30", "00:00"),
    });
  });
});

describe("overlaps on no resource (N3)", () => {
  const anas = occurrence("a", "2026-10-26T09:00", "2026-10-26T10:00", {
    resourceIds: ["ana"],
  });
  const free = occurrence("f", "2026-10-26T11:00", "2026-10-26T12:00");
  const rules = {
    timeZone: BRUSSELS,
    constraints: { allowOverlap: false },
    resources: new Map([["ana", { id: "ana", label: "Ana" }]]),
    businessHours: [],
    hoursOn: () => [],
    backgrounds: [],
    occurrences: [anas, free],
    calendars: [],
  };
  const placement = (start: string, end: string) => ({
    start: at("2026-10-26", start),
    end: at("2026-10-26", end),
    allDay: false,
    resourceIds: [],
  });

  it("lets an event on no resource sit beside a resource's events", () => {
    expect(
      checkDrop(
        {
          placement: placement("09:00", "10:00"),
          copy: false,
          checkDuration: true,
        },
        rules,
      ),
    ).toBeNull();
  });

  it("still refuses one over another event on no resource", () => {
    expect(
      checkDrop(
        {
          placement: placement("11:30", "12:30"),
          copy: false,
          checkDuration: true,
        },
        rules,
      ),
    ).toBe("overlap");
  });
});

describe("Undo of an event stored without an end (N16)", () => {
  it("sends a null end as before", () => {
    const loose: AgendaOccurrence = {
      ...occurrence("x", "2026-10-26T09:00", "2026-10-26T10:00"),
    };
    loose.event = { id: "x", title: "X", start: "2026-10-26T09:00:00+01:00" };
    const change = placementChange(
      loose,
      {
        start: loose.start + 60 * MINUTE,
        end: loose.end + 60 * MINUTE,
        allDay: false,
        resourceIds: [],
      },
      "move",
      BRUSSELS,
    );
    expect(change.previous).toMatchObject({
      start: "2026-10-26T09:00:00+01:00",
      end: null,
    });
  });
});

describe("snapping over the spring-forward gap (m14)", () => {
  it("lands a two-hour snap on 03:00 CEST, past the gap of 29 March", () => {
    // 03:05 CEST on 29/03/2026 is 01:05Z; floored to 2 h: 02:00 does not exist.
    const floored = snapInstant(
      Date.parse("2026-03-29T01:05:00Z"),
      120,
      BRUSSELS,
      "floor",
    );
    expect(iso(floored)).toBe("2026-03-29T01:00:00.000Z");
    const rounded = snapInstant(
      Date.parse("2026-03-29T01:05:00Z"),
      120,
      BRUSSELS,
    );
    expect(iso(rounded)).toBe("2026-03-29T02:00:00.000Z");
  });

  it("still keeps the second pass of the repeated hour with a quarter hour step", () => {
    expect(
      iso(snapInstant(Date.parse("2026-10-25T01:37:00Z"), 15, BRUSSELS)),
    ).toBe("2026-10-25T01:30:00.000Z");
  });
});
