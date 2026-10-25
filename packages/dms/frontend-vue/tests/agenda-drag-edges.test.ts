/**
 * Edges of the drag (critic round 1): keyboard moves over hidden days and
 * by slots (#15), a resize over a day cell of an event ending at midnight
 * (#26), the repeated hour of 2026-10-25 kept apart in a time grid and in a
 * timeline by hour from real targets (#27), overlaps checked against every
 * event of the range but all-day and cancelled ones (#28), auto-scroll that
 * stops far outside (#31), pending items and copies (#59).
 */
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { AgendaCalendar } from "../layers/dms-ui/app/types/full-agenda";
import type {
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { placeDrag } from "../layers/dms-ui/app/build/composables/agenda/agendaDragMath";
import type { AgendaDragConfig } from "../layers/dms-ui/app/build/composables/agenda/agendaDragBasics";
import {
  AGENDA_KEY_STEPS,
  nudgeSource,
  nudgeTarget,
} from "../layers/dms-ui/app/build/composables/agenda/agendaDragKeys";
import type { AgendaNudgeContext } from "../layers/dms-ui/app/build/composables/agenda/agendaDragKeys";
import { checkDrop } from "../layers/dms-ui/app/build/composables/agenda/agendaDragRules";
import {
  buildPreview,
  dropRules,
} from "../layers/dms-ui/app/build/composables/agenda/agendaDragPreview";
import type { AgendaDragDeps } from "../layers/dms-ui/app/build/composables/agenda/agendaDragPreview";
import { unscheduleChange } from "../layers/dms-ui/app/build/composables/agenda/agendaDragChange";
import { AgendaDropCommitter } from "../layers/dms-ui/app/build/composables/agenda/agendaDragCommit";
import { edgeSpeed } from "../layers/dms-ui/app/build/composables/agenda/agendaDragDom";
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

const CONFIG: AgendaDragConfig = {
  timeZone: BRUSSELS,
  snapMinutes: 15,
  slots: [],
  hiddenDays: [],
  defaultDurationMinutes: 60,
  dayDropMinutes: 480,
  minDurationMinutes: 15,
};
const SLOTS = parseSlots([
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
]);

function nudged(
  item: AgendaOccurrence,
  key: string,
  context: AgendaNudgeContext,
  isResize = false,
) {
  const step = AGENDA_KEY_STEPS[key]!;
  const config = { ...CONFIG, hiddenDays: context.hiddenDays, slots: SLOTS };
  return placeDrag(
    nudgeSource(item, isResize, context),
    nudgeTarget(item, step, isResize, context),
    config,
  );
}

describe("keyboard moves (#15)", () => {
  const weekdays: AgendaNudgeContext = {
    snapMinutes: 15,
    hiddenDays: [0, 6],
    timeZone: BRUSSELS,
    slots: [],
  };

  it("jumps over a hidden weekend", () => {
    const friday = occurrence("f", "2026-10-30T13:00", "2026-10-30T14:00");
    expect(nudged(friday, "ArrowRight", weekdays).start).toBe(
      at("2026-11-02", "13:00"),
    );
    const monday = occurrence("m", "2026-11-02T13:00", "2026-11-02T14:00");
    expect(nudged(monday, "ArrowLeft", weekdays).start).toBe(
      at("2026-10-30", "13:00"),
    );
  });

  it("moves by a slot on a timeline by slot, and its end by a slot", () => {
    const bySlot = { ...weekdays, slots: SLOTS };
    const s1 = occurrence("s", "2026-10-26T08:00", "2026-10-26T10:00");
    const down = nudged(s1, "ArrowDown", bySlot);
    expect([down.start, down.end]).toEqual([
      at("2026-10-26", "10:00"),
      at("2026-10-26", "12:00"),
    ]);
    const s4 = occurrence("s", "2026-10-30T15:00", "2026-10-30T17:00");
    expect(nudged(s4, "ArrowDown", bySlot).start).toBe(
      at("2026-11-02", "08:00"),
    );
    expect(nudged(s1, "ArrowDown", bySlot, true).end).toBe(
      at("2026-10-26", "12:00"),
    );
  });
});

describe("resizing over a day cell (#26)", () => {
  it("ends at the midnight after the day hovered", () => {
    const night = occurrence("n", "2026-10-26T22:00", "2026-10-27T00:00");
    const placement = placeDrag(
      { kind: "resizeEnd", occurrence: night, origin: null },
      { day: "2026-10-28" },
      CONFIG,
    );
    expect(placement.end).toBe(at("2026-10-29", "00:00"));
  });
});

describe("the repeated hour of 2026-10-25 (#27)", () => {
  // 02:30 CET, the second pass: 01:30 UTC.
  const second: AgendaOccurrence = {
    ...occurrence("d", "2026-10-25T02:30", "2026-10-25T03:00"),
    start: Date.parse("2026-10-25T01:30:00Z"),
    end: Date.parse("2026-10-25T02:00:00Z"),
  };

  it("keeps the instant of a time grid drag that moves nothing", () => {
    const placement = placeDrag(
      {
        kind: "move",
        occurrence: second,
        origin: { day: "2026-10-25", minutes: 155 },
      },
      { day: "2026-10-25", minutes: 158 },
      CONFIG,
    );
    expect(iso(placement.start)).toBe("2026-10-25T01:30:00.000Z");
  });

  it("moves by instants on a timeline by hour", () => {
    const columns = buildTimelineColumns({
      days: agendaDays("2026-10-25", 1),
      scale: "hour",
      slots: [],
      dayStartMinutes: 0,
      dayEndMinutes: 1440,
      timeZone: BRUSSELS,
    });
    const over = (epoch: number) => {
      const index = columns.findIndex(
        (column) => column.start <= epoch && epoch < column.end,
      );
      const column = columns[index]!;
      return timelineTargetAt({
        columns,
        position: index + (epoch - column.start) / (column.end - column.start),
        scale: "hour",
        resourceId: null,
        snapMinutes: 15,
        timeZone: BRUSSELS,
      })!;
    };
    const grab = over(second.start + 5 * 60_000);
    expect(grab.instant).toBeDefined();
    const still = placeDrag(
      { kind: "move", occurrence: second, origin: grab },
      over(second.start + 6 * 60_000),
      CONFIG,
    );
    expect(iso(still.start)).toBe("2026-10-25T01:30:00.000Z");
    const later = placeDrag(
      { kind: "move", occurrence: second, origin: grab },
      over(second.start + 65 * 60_000),
      CONFIG,
    );
    expect(iso(later.start)).toBe("2026-10-25T02:30:00.000Z");
  });
});

const OPTIONS: ResolvedAgendaOptions = {
  raw: { constraints: { allowOverlap: false } },
  editable: true,
  dragMove: true,
  dragResize: true,
  canCreate: true,
  createTrigger: "click",
  dayStartMinutes: 0,
  dayEndMinutes: 1440,
  slotMinutes: 30,
  snapMinutes: 15,
  hourHeight: 48,
  scrollMinutes: 480,
  defaultDurationMinutes: 60,
  maxEventsPerDay: 3,
  weekStartsOn: 1,
  hiddenDays: [],
  timeZone: BRUSSELS,
  slots: [],
  businessHours: [],
  fields: [],
  eventActions: [],
  toolbarActions: [],
  urlState: false,
  shortcuts: false,
  compactBelow: 640,
};

const WEEK: ResolvedAgendaView = {
  id: "week",
  type: "week",
  label: "Week",
  hiddenDays: [],
  dayStart: "00:00",
  dayEnd: "24:00",
  slotMinutes: 30,
  duration: 7,
  scale: "hour",
  resourceLayout: "resourcesFirst",
  yearLayout: "planner",
};

function deps(extra: Partial<AgendaDragDeps> = {}): AgendaDragDeps {
  return {
    options: computed(() => OPTIONS),
    view: computed(() => WEEK),
    occurrences: computed(() => []),
    resources: computed(() => []),
    backgrounds: computed(() => []),
    hoursOn: () => [],
    apply: vi.fn(() => Promise.resolve()),
    createAt: vi.fn(),
    format: {
      locale: computed(() => "en-GB"),
      time: String,
      timeRange: String,
      day: (key) => key,
      month: String,
      title: computed(() => ""),
      duration: String,
    },
    t: (key) => key,
    ...extra,
  };
}

describe("overlaps (#28)", () => {
  const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00");
  const hiddenShift = occurrence("h", "2026-10-26T13:00", "2026-10-26T15:00");

  it("checks the events the legend hides too", () => {
    const rules = dropRules(
      deps({
        occurrences: computed(() => [meeting]),
        rangeOccurrences: computed(() => [meeting, hiddenShift]),
      }),
      "move",
    );
    const placement = {
      start: at("2026-10-26", "14:00"),
      end: at("2026-10-26", "15:00"),
      allDay: false,
      resourceIds: [],
    };
    expect(
      checkDrop(
        { placement, occurrence: meeting, copy: false, checkDuration: false },
        rules,
      ),
    ).toBe("overlap");
  });

  it("lets all-day and cancelled events be overlapped", () => {
    const leave = occurrence("l", "2026-10-26", "2026-10-26");
    const cancelled = occurrence("c", "2026-10-26T14:00", "2026-10-26T15:00", {
      status: "cancelled",
    });
    const rules = dropRules(
      deps({ occurrences: computed(() => [meeting, leave, cancelled]) }),
      "move",
    );
    const placement = {
      start: at("2026-10-26", "14:00"),
      end: at("2026-10-26", "15:00"),
      allDay: false,
      resourceIds: [],
    };
    expect(
      checkDrop(
        { placement, occurrence: meeting, copy: false, checkDuration: false },
        rules,
      ),
    ).toBeNull();
  });
});

describe("pending items and copies (#59)", () => {
  it("refuses a limited item dropped on no resource, and an item of a read-only calendar", () => {
    const calendars = ref<AgendaCalendar[]>([
      { id: "frozen", label: "Frozen", editable: false },
    ]);
    const base = deps({ calendars });
    const rules = dropRules(base, "external");
    const target = { day: "2026-10-26", minutes: 540 };
    const limited = buildPreview(base, {
      source: {
        kind: "external",
        item: { id: "p", title: "P", allowedResourceIds: ["ana"] },
        origin: null,
      },
      target,
      alt: false,
      rules,
    });
    expect(limited?.reason).toBe("dms.agenda.drag.reason.resourceNotAllowed");
    const frozen = buildPreview(base, {
      source: {
        kind: "external",
        item: { id: "q", title: "Q", calendarId: "frozen" },
        origin: null,
      },
      target,
      alt: false,
      rules,
    });
    expect(frozen?.reason).toBe("dms.agenda.drag.reason.calendarReadOnly");
  });

  it("sends one occurrence of a series back, not the series", () => {
    const standup: AgendaOccurrence = {
      ...occurrence("s@2026-10-27", "2026-10-27T09:00", "2026-10-27T09:15"),
      recurring: { seriesId: "s", occurrence: "2026-10-27" },
    };
    expect(unscheduleChange(standup)).toMatchObject({
      kind: "unschedule",
      id: "s",
      occurrence: "2026-10-27",
    });
  });

  it("does not copy an event onto itself", () => {
    const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00");
    const base = deps();
    new AgendaDropCommitter(base, () => {}).drop(
      { kind: "move", occurrence: meeting, origin: null },
      "M",
      {
        kind: "move",
        start: meeting.start,
        end: meeting.end,
        allDay: false,
        resourceIds: [],
        valid: true,
        copy: true,
        toPending: false,
      },
    );
    expect(base.apply).not.toHaveBeenCalled();
  });
});

describe("auto-scroll (#31)", () => {
  it("scrolls near an edge and just past it, not from far away", () => {
    expect(edgeSpeed(105, 100, 600)).toBeLessThan(0);
    expect(edgeSpeed(80, 100, 600)).toBeLessThan(0);
    expect(edgeSpeed(20, 100, 600)).toBe(0);
    expect(edgeSpeed(350, 100, 600)).toBe(0);
  });
});
