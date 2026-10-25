/**
 * Planning a pending item from the keyboard (N6): `planPending` goes through
 * the placement and the rules of a drop, from the anchor day on, over the
 * shown days, slots and allowed resources, and resolves whether it wrote.
 */
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type {
  AgendaBusinessHours,
  AgendaCalendar,
  AgendaPendingItem,
  AgendaResource,
} from "../layers/dms-ui/app/types/full-agenda";
import type {
  AgendaChange,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type { AgendaDragDeps } from "../layers/dms-ui/app/build/composables/agenda/agendaDragPreview";
import { planPendingItem } from "../layers/dms-ui/app/build/composables/agenda/agendaDragPlan";
import { BRUSSELS, agendaDays, occurrence } from "./fixtures/agendaOccurrences";

type Raw = ResolvedAgendaOptions["raw"];

const SLOTS = [
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
];

interface PlanSetup {
  raw?: Raw;
  view?: Partial<ResolvedAgendaView>;
  anchor?: string;
  from?: string;
  dayCount?: number;
  occurrences?: AgendaOccurrence[];
  resources?: AgendaResource[];
  calendars?: AgendaCalendar[];
  businessHours?: AgendaBusinessHours[];
  slots?: typeof SLOTS;
}

function options(setup: PlanSetup): ResolvedAgendaOptions {
  return {
    raw: setup.raw ?? {},
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
    hiddenDays: [0, 6],
    timeZone: BRUSSELS,
    slots: setup.slots ?? [],
    businessHours: setup.businessHours ?? [],
    fields: [],
    eventActions: [],
    toolbarActions: [],
    urlState: false,
    shortcuts: false,
    compactBelow: 640,
  };
}

function deps(setup: PlanSetup) {
  const applied: AgendaChange[] = [];
  const days = agendaDays(
    setup.from ?? "2026-10-26",
    setup.dayCount ?? 7,
    [0, 6],
  );
  const view: ResolvedAgendaView = {
    id: "week",
    type: "week",
    label: "Week",
    hiddenDays: [0, 6],
    dayStart: "00:00",
    dayEnd: "24:00",
    slotMinutes: 30,
    duration: 7,
    scale: "hour",
    resourceLayout: "resourcesFirst",
    yearLayout: "planner",
    ...setup.view,
  };
  const value: AgendaDragDeps = {
    options: computed(() => options(setup)),
    view: computed(() => view),
    occurrences: computed(() => setup.occurrences ?? []),
    resources: computed(() => setup.resources ?? []),
    calendars: ref(setup.calendars ?? []),
    backgrounds: computed(() => []),
    hoursOn: (weekday) =>
      (setup.businessHours ?? []).filter((hours) =>
        hours.days.includes(weekday),
      ),
    apply: vi.fn(async (change: AgendaChange) => {
      applied.push(change);
      return true;
    }),
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
    range: computed(() => ({
      from: days[0]!.key,
      to: days.at(-1)!.key,
      days,
      start: days[0]!.start,
      end: days.at(-1)!.end,
    })),
    anchor: ref(setup.anchor ?? days[0]!.key),
  };
  return { deps: value, applied };
}

const ITEM: AgendaPendingItem = {
  id: "45601",
  title: "Client_1",
  durationMinutes: 60,
};

describe("planning a pending item from the keyboard", () => {
  it("skips a hidden anchor day: on a Saturday, the first shown day of the range", async () => {
    const { deps: planner, applied } = deps({ anchor: "2026-10-31" });
    expect(await planPendingItem(planner, ITEM)).toBe(true);
    expect(applied[0]).toMatchObject({
      kind: "schedule",
      id: "45601",
      patch: {
        start: "2026-10-26T08:00:00+01:00",
        end: "2026-10-26T09:00:00+01:00",
      },
    });
  });

  it("goes around an event under allowOverlap: false", async () => {
    const { deps: planner, applied } = deps({
      raw: { constraints: { allowOverlap: false } },
      occurrences: [occurrence("e1", "2026-10-26T08:00", "2026-10-26T09:30")],
    });
    await planPendingItem(planner, ITEM);
    expect(applied[0]?.patch?.start).toBe("2026-10-26T09:30:00+01:00");
  });

  it("keeps to the business hours under withinBusinessHours", async () => {
    const { deps: planner, applied } = deps({
      raw: { constraints: { withinBusinessHours: true } },
      businessHours: [{ days: [1, 2, 3, 4, 5], start: "10:00", end: "18:00" }],
    });
    await planPendingItem(planner, ITEM);
    expect(applied[0]?.patch?.start).toBe("2026-10-26T10:00:00+01:00");
  });

  it("plans by slots, durationSlots long, over the hidden weekend", async () => {
    const { deps: planner, applied } = deps({
      view: { type: "timeline", scale: "slot" },
      slots: SLOTS,
      anchor: "2026-10-30",
      dayCount: 14,
      resources: [{ id: "ana", label: "Ana" }],
    });
    await planPendingItem(planner, { id: "p", title: "P", durationSlots: 6 });
    expect(applied[0]?.patch).toMatchObject({
      start: "2026-10-30T08:00:00+01:00",
      end: "2026-11-02T12:00:00+01:00",
      resourceIds: ["ana"],
    });
  });

  it("takes the first allowed resource, not the first one", async () => {
    const { deps: planner, applied } = deps({
      view: { type: "resources" },
      resources: [
        { id: "ana", label: "Ana" },
        { id: "bob", label: "Bob" },
      ],
    });
    await planPendingItem(planner, { ...ITEM, allowedResourceIds: ["bob"] });
    expect(applied[0]?.patch?.resourceIds).toEqual(["bob"]);
  });

  it("refuses an item of a read-only calendar, and a refused target", async () => {
    const frozen = deps({
      calendars: [{ id: "c", label: "C", editable: false }],
    });
    expect(
      await planPendingItem(frozen.deps, { ...ITEM, calendarId: "c" }),
    ).toBe(false);
    expect(frozen.applied).toHaveLength(0);
    const bounded = deps({ raw: { maxDate: "2026-10-27" } });
    expect(
      await planPendingItem(bounded.deps, ITEM, {
        day: "2026-10-29",
        minutes: 600,
      }),
    ).toBe(false);
    expect(bounded.applied).toHaveLength(0);
  });

  it("resolves false when the save refuses it", async () => {
    const { deps: planner } = deps({});
    planner.apply = vi.fn(async () => false);
    expect(await planPendingItem(planner, ITEM)).toBe(false);
  });
});
