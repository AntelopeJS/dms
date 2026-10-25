// @vitest-environment jsdom
/**
 * The drag engine of the FullAgenda end to end over fake surfaces (a grid of
 * three days, a pending list): the threshold that leaves a click alone, a
 * move to another day and resource, Esc, Alt copy, a refused drop, the
 * touch hold, a range on empty time, pending items in and out, and the
 * keyboard nudge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AgendaResource } from "../layers/dms-ui/app/types/full-agenda";
import type {
  AgendaDropTarget,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { useAgendaDrag } from "../layers/dms-ui/app/build/composables/agenda/useAgendaDrag";
import { zonedEpoch } from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import { BRUSSELS, occurrence } from "./fixtures/agendaOccurrences";

const iso = (ms: number) => new Date(ms).toISOString();
const at = (day: string, time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return zonedEpoch(day, hours * 60 + minutes, BRUSSELS);
};

const VIEW: ResolvedAgendaView = {
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

const DAY_WIDTH = 100;
const DAYS = ["2026-10-26", "2026-10-27", "2026-10-28"];

function resolvedOptions(
  raw: ResolvedAgendaOptions["raw"] = {},
): ResolvedAgendaOptions {
  return {
    raw,
    editable: true,
    dragMove: true,
    dragResize: true,
    canCreate: true,
    createTrigger: "drag",
    dayStartMinutes: 0,
    dayEndMinutes: 1440,
    slotMinutes: 30,
    snapMinutes: 15,
    hourHeight: 60,
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
}

function pointer(
  type: string,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): PointerEvent {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointermove" ? 1 : 0,
    altKey: Boolean(extra.altKey),
  });
  Object.defineProperty(event, "pointerId", { value: extra.pointerId ?? 1 });
  Object.defineProperty(event, "pointerType", {
    value: extra.pointerType ?? "mouse",
  });
  return event as PointerEvent;
}

function setup(
  raw: ResolvedAgendaOptions["raw"] = {},
  occurrences: AgendaOccurrence[] = [],
) {
  const apply = vi.fn(() => Promise.resolve());
  const createAt = vi.fn();
  const resources = ref<AgendaResource[]>([
    { id: "ana", label: "Ana" },
    { id: "bob", label: "Bob" },
  ]);
  const drag = useAgendaDrag({
    options: computed(() => resolvedOptions(raw)),
    view: computed(() => VIEW),
    occurrences: computed(() => occurrences),
    resources,
    backgrounds: computed(() => []),
    hoursOn: () => [],
    apply,
    createAt,
    format: {
      locale: computed(() => "en-GB"),
      time: String,
      timeRange: (start, end) =>
        `${iso(start)}–${end === undefined ? "" : iso(end)}`,
      day: (key) => key,
      month: String,
      title: computed(() => ""),
      duration: String,
    },
    t: (key, params) =>
      params && Object.keys(params).length
        ? `${key} ${JSON.stringify(params)}`
        : key,
  });
  // A grid of three days, 100 px each, a pixel per minute; y ≥ 2000 is the pending list.
  const grid = document.createElement("div");
  document.body.append(grid);
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 300,
    bottom: 1440,
    width: 300,
    height: 1440,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  drag.registerSurface({
    el: grid,
    resolve: (x, y): AgendaDropTarget => ({
      day: DAYS[Math.floor(x / DAY_WIDTH)]!,
      minutes: y,
      resourceId: x % DAY_WIDTH < 50 ? "ana" : "bob",
    }),
  });
  const list = document.createElement("div");
  document.body.append(list);
  list.getBoundingClientRect = () => ({
    left: 0,
    top: 2000,
    right: 300,
    bottom: 2400,
    width: 300,
    height: 400,
    x: 0,
    y: 2000,
    toJSON: () => ({}),
  });
  drag.registerSurface({
    el: list,
    resolve: () => ({ day: DAYS[0]!, pending: true }),
  });
  const chip = document.createElement("button");
  grid.append(chip);
  return { drag, apply, createAt, chip };
}

function press(
  chip: Element,
  x: number,
  y: number,
  extra: Record<string, unknown> = {},
): PointerEvent {
  const event = pointer("pointerdown", x, y, extra);
  chip.dispatchEvent(event);
  return event;
}

// Ana's 09:00–10:00 on Monday, grabbed at 09:20 (x 10, y 560).
const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00", {
  resourceIds: ["ana"],
});

beforeEach(() =>
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  }),
);
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("pointer drags", () => {
  it("leaves a press under the threshold to the click", () => {
    const { drag, apply, chip } = setup();
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 12, 562));
    expect(drag.active.value).toBe(false);
    window.dispatchEvent(pointer("pointerup", 12, 562));
    expect(apply).not.toHaveBeenCalled();
    const onClick = vi.fn();
    chip.addEventListener("click", onClick);
    chip.click();
    expect(onClick).toHaveBeenCalled();
  });

  it("moves an event to another day and resource, then swallows the click", () => {
    const { drag, apply, chip } = setup({}, [meeting]);
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 20, 580));
    expect(drag.active.value).toBe(true);
    window.dispatchEvent(pointer("pointermove", 160, 620));
    vi.advanceTimersByTime(20);
    expect(drag.preview.value).toMatchObject({
      kind: "move",
      occurrenceKey: "m",
      valid: true,
      resourceIds: ["bob"],
    });
    window.dispatchEvent(pointer("pointerup", 160, 620));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "move",
        id: "m",
        patch: {
          start: "2026-10-27T10:00:00+01:00",
          end: "2026-10-27T11:00:00+01:00",
          allDay: false,
          resourceIds: ["bob"],
        },
        previous: expect.objectContaining({ start: "2026-10-26T09:00" }),
      }),
      meeting,
    );
    expect(drag.preview.value).toBeNull();
    const onClick = vi.fn();
    chip.addEventListener("click", onClick);
    chip.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(drag.announcement.value).toContain("dms.agenda.drag.moved");
  });
});

describe("Escape, Alt and refusals", () => {
  it("cancels on Escape", () => {
    const { drag, apply, chip } = setup();
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 160, 620));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(drag.active.value).toBe(false);
    window.dispatchEvent(pointer("pointerup", 160, 620));
    expect(apply).not.toHaveBeenCalled();
    expect(drag.announcement.value).toBe("dms.agenda.drag.cancelled");
  });

  it("copies with Alt under copyOnAltDrag", () => {
    const { drag, apply, chip } = setup({ copyOnAltDrag: true });
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 110, 560, { altKey: true }));
    window.dispatchEvent(pointer("pointerup", 110, 560, { altKey: true }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        tempId: expect.stringMatching(/^copy-m-/),
        patch: expect.objectContaining({ title: "Event m" }),
      }),
    );
  });

  it("shows a refused drop and writes nothing", () => {
    const limited = occurrence("x", "2026-10-26T09:00", "2026-10-26T10:00", {
      resourceIds: ["ana"],
      allowedResourceIds: ["ana"],
    });
    const { drag, apply, chip } = setup({}, [limited]);
    drag.startOccurrence(press(chip, 10, 560), limited, "move");
    window.dispatchEvent(pointer("pointermove", 70, 560));
    vi.advanceTimersByTime(20);
    expect(drag.preview.value).toMatchObject({
      valid: false,
      reason: "dms.agenda.drag.reason.resourceNotAllowed",
    });
    window.dispatchEvent(pointer("pointerup", 70, 560));
    expect(apply).not.toHaveBeenCalled();
    expect(drag.announcement.value).toContain("dms.agenda.drag.refused");
  });
});

describe("touch, ranges and pending items", () => {
  it("waits for a touch to be held before dragging, and lets an early move scroll", () => {
    const { drag, chip } = setup();
    drag.startOccurrence(
      press(chip, 10, 560, { pointerType: "touch" }),
      meeting,
      "move",
    );
    window.dispatchEvent(
      pointer("pointermove", 10, 600, { pointerType: "touch" }),
    );
    vi.advanceTimersByTime(300);
    expect(drag.active.value).toBe(false);

    drag.startOccurrence(
      press(chip, 10, 560, { pointerType: "touch" }),
      meeting,
      "move",
    );
    vi.advanceTimersByTime(260);
    expect(drag.active.value).toBe(true);
    drag.cancel();
  });

  it("creates on a range dragged over empty time", () => {
    const { drag, createAt, chip } = setup();
    drag.startEmpty(press(chip, 60, 545), {
      day: "2026-10-26",
      minutes: 545,
      resourceId: "bob",
    });
    window.dispatchEvent(pointer("pointermove", 60, 640));
    window.dispatchEvent(pointer("pointerup", 60, 640));
    expect(createAt).toHaveBeenCalledWith({
      start: at("2026-10-26", "09:00"),
      end: at("2026-10-26", "10:45"),
      allDay: false,
      resourceIds: ["bob"],
    });
  });

  it("schedules a pending item and unschedules an event dropped on the list", () => {
    const { drag, apply, chip } = setup({}, [meeting]);
    drag.startPending(press(chip, 10, 2100), {
      id: "45601",
      title: "Client_1",
      durationMinutes: 120,
    });
    window.dispatchEvent(pointer("pointermove", 260, 600));
    window.dispatchEvent(pointer("pointerup", 260, 600));
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "schedule",
        id: "45601",
        patch: expect.objectContaining({
          start: "2026-10-28T10:00:00+01:00",
          resourceIds: ["bob"],
        }),
      }),
    );

    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 10, 2100));
    window.dispatchEvent(pointer("pointerup", 10, 2100));
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "unschedule", id: "m" }),
      meeting,
    );
  });
});

describe("the keyboard", () => {
  it("moves a focused event with Alt and the arrows", () => {
    const { drag, apply } = setup({}, [meeting]);
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
    });
    expect(drag.nudge(down, meeting)).toBe(true);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "move",
        patch: expect.objectContaining({ start: "2026-10-26T09:15:00+01:00" }),
      }),
      meeting,
    );
    const longer = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      shiftKey: true,
    });
    drag.nudge(longer, meeting);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "resize",
        patch: expect.objectContaining({ end: "2026-10-26T10:15:00+01:00" }),
      }),
      meeting,
    );
    expect(
      drag.nudge(new KeyboardEvent("keydown", { key: "ArrowDown" }), meeting),
    ).toBe(false);
  });
});

describe("a lost pointerup (#32)", () => {
  it("cancels when the window loses focus mid-drag", () => {
    const { drag, apply, chip } = setup({}, [meeting]);
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 160, 620));
    expect(drag.active.value).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(drag.active.value).toBe(false);
    window.dispatchEvent(pointer("pointerup", 160, 620));
    expect(apply).not.toHaveBeenCalled();
  });

  it("cancels on a mouse move with no button down", () => {
    const { drag, apply, chip } = setup({}, [meeting]);
    drag.startOccurrence(press(chip, 10, 560), meeting, "move");
    window.dispatchEvent(pointer("pointermove", 160, 620));
    const released = pointer("pointermove", 170, 640);
    Object.defineProperty(released, "buttons", { value: 0 });
    window.dispatchEvent(released);
    expect(drag.active.value).toBe(false);
    expect(document.body.dataset.agendaDragging).toBeUndefined();
    window.dispatchEvent(pointer("pointerup", 170, 640));
    expect(apply).not.toHaveBeenCalled();
  });
});
