/**
 * Drags on a timeline by slot, from the targets its real hit test answers
 * (`buildTimelineColumns` + `timelineTargetAt`): S1 08–10, S2 10–12, S3
 * 13–15, S4 15–17, weekends hidden, Europe/Brussels. A range, a resize and
 * a move run by whole slots and spill over to the next shown day.
 */
import { describe, expect, it } from "vitest";
import type { AgendaSlot } from "../layers/dms-ui/app/types/full-agenda";
import type { AgendaDropTarget } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { placeDrag } from "../layers/dms-ui/app/build/composables/agenda/agendaDragMath";
import type { AgendaDragConfig } from "../layers/dms-ui/app/build/composables/agenda/agendaDragBasics";
import { parseSlots } from "../layers/dms-ui/app/build/composables/agenda/agendaSlots";
import { buildTimelineColumns } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineLayout";
import { timelineTargetAt } from "../layers/dms-ui/app/build/composables/agenda/agendaTimelineHitTest";
import { zonedEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { BRUSSELS, agendaDays, occurrence } from "./fixtures/agendaOccurrences";

const SLOTS: AgendaSlot[] = [
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
];
const WEEKEND = [0, 6];
const PARSED = parseSlots(SLOTS);

const CONFIG: AgendaDragConfig = {
  timeZone: BRUSSELS,
  snapMinutes: 15,
  slots: PARSED,
  hiddenDays: WEEKEND,
  defaultDurationMinutes: 60,
  dayDropMinutes: 480,
  minDurationMinutes: 15,
};

const COLUMNS = buildTimelineColumns({
  days: agendaDays("2026-10-26", 14, WEEKEND),
  scale: "slot",
  slots: PARSED,
  dayStartMinutes: 0,
  dayEndMinutes: 1440,
  timeZone: BRUSSELS,
});

/** What the hit test answers over the middle of a slot of a day, on Ana's row. */
function over(day: string, slot: number): AgendaDropTarget {
  const index = COLUMNS.findIndex(
    (column) => column.day === day && column.slotIndex === slot,
  );
  const target = timelineTargetAt({
    columns: COLUMNS,
    position: index + 0.5,
    scale: "slot",
    resourceId: "ana",
    snapMinutes: 15,
    timeZone: BRUSSELS,
  });
  expect(target?.slotIndex).toBe(slot);
  return target!;
}

const at = (day: string, time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return zonedEpoch(day, hours * 60 + minutes, BRUSSELS);
};

describe("dragging on a timeline by slot", () => {
  it("picks a range from S1 to S3 as the whole slots", () => {
    const placement = placeDrag(
      { kind: "create", origin: over("2026-10-26", 0) },
      over("2026-10-26", 2),
      CONFIG,
    );
    expect([placement.start, placement.end]).toEqual([
      at("2026-10-26", "08:00"),
      at("2026-10-26", "15:00"),
    ]);
    expect(placement.resourceIds).toEqual(["ana"]);
  });

  it("resizes an S1 event to the end of the slot hovered, never shorter than its own", () => {
    const s1 = occurrence("s1", "2026-10-26T08:00", "2026-10-26T10:00");
    const toS3 = placeDrag(
      { kind: "resizeEnd", occurrence: s1, origin: over("2026-10-26", 0) },
      over("2026-10-26", 2),
      CONFIG,
    );
    expect(toS3.end).toBe(at("2026-10-26", "15:00"));
    const ownSlot = placeDrag(
      { kind: "resizeEnd", occurrence: s1, origin: over("2026-10-26", 0) },
      over("2026-10-26", 0),
      CONFIG,
    );
    expect(ownSlot.end).toBe(at("2026-10-26", "10:00"));
  });

  it("moves a 6-slot event to Thursday S3: it ends on Friday S4, not on a hidden day", () => {
    const task = occurrence("t", "2026-10-26T08:00", "2026-10-27T12:00");
    const placement = placeDrag(
      { kind: "move", occurrence: task, origin: over("2026-10-26", 0) },
      over("2026-10-29", 2),
      CONFIG,
    );
    expect(placement.start).toBe(at("2026-10-29", "13:00"));
    expect(placement.end).toBe(at("2026-10-30", "17:00"));
  });

  it("moves a 2-slot S3–S4 event one slot on: it spills to Tuesday S1", () => {
    const task = occurrence("t", "2026-10-26T13:00", "2026-10-26T17:00");
    const placement = placeDrag(
      { kind: "move", occurrence: task, origin: over("2026-10-26", 2) },
      over("2026-10-26", 3),
      CONFIG,
    );
    expect(placement.start).toBe(at("2026-10-26", "15:00"));
    expect(placement.end).toBe(at("2026-10-27", "10:00"));
  });

  it("moves across the hidden weekend by shown slots", () => {
    const task = occurrence("t", "2026-10-30T15:00", "2026-10-30T17:00");
    const placement = placeDrag(
      { kind: "move", occurrence: task, origin: over("2026-10-30", 3) },
      over("2026-11-02", 0),
      CONFIG,
    );
    expect([placement.start, placement.end]).toEqual([
      at("2026-11-02", "08:00"),
      at("2026-11-02", "10:00"),
    ]);
  });

  it("drops a pending item of 6 slots on Friday S3 and runs on to Monday", () => {
    const placement = placeDrag(
      {
        kind: "external",
        item: { id: "45601", title: "Client_1", durationSlots: 6 },
        origin: null,
      },
      over("2026-10-30", 2),
      CONFIG,
    );
    expect([placement.start, placement.end]).toEqual([
      at("2026-10-30", "13:00"),
      at("2026-11-02", "17:00"),
    ]);
  });
});
