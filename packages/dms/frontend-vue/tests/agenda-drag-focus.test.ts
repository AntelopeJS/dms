// @vitest-environment jsdom
/**
 * The focus after a move (critic round 3): the moved event is named for
 * refocus as soon as its change is drawn, not after the save answers (M3);
 * the name is dropped once its chip has the focus, and forgotten when the
 * range or the view changes (m6); a mouse drag reads the focused chip at
 * the drop, after the click focused it (m10).
 */
import { computed, effectScope, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgendaRange,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type { AgendaDragDeps } from "../layers/dms-ui/app/build/composables/agenda/agendaDragPreview";
import { useAgendaDrag } from "../layers/dms-ui/app/build/composables/agenda/useAgendaDrag";
import { BRUSSELS, agendaDays, occurrence } from "./fixtures/agendaOccurrences";

const OPTIONS: ResolvedAgendaOptions = {
  raw: {},
  editable: true,
  dragMove: true,
  dragResize: true,
  canCreate: true,
  createTrigger: "click",
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

const meeting = occurrence("m", "2026-10-26T09:00", "2026-10-26T10:00");
const ALT_RIGHT = { key: "ArrowRight", altKey: true };

function rangeOf(from: string): AgendaRange {
  const days = agendaDays(from, 7);
  return {
    from: days[0]!.key,
    to: days.at(-1)!.key,
    days,
    start: days[0]!.start,
    end: days.at(-1)!.end,
  };
}

function setup(apply: AgendaDragDeps["apply"]) {
  const range = ref(rangeOf("2026-10-26"));
  const scope = effectScope();
  const drag = scope.run(() =>
    useAgendaDrag({
      options: computed(() => OPTIONS),
      view: computed(() => WEEK),
      occurrences: computed(() => [meeting]),
      resources: computed(() => []),
      backgrounds: computed(() => []),
      hoursOn: () => [],
      apply,
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
      range,
    }),
  )!;
  return { drag, range, scope };
}

/** A chip of the event in the document. */
function chip(): HTMLButtonElement {
  const button = document.createElement("button");
  button.dataset.agendaOccurrence = "m";
  document.body.append(button);
  return button;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("refocus after a keyboard move", () => {
  it("names the event at once, while the save is still running (M3)", () => {
    const { drag, scope } = setup(vi.fn(() => new Promise<boolean>(() => {})));
    expect(drag.nudge(new KeyboardEvent("keydown", ALT_RIGHT), meeting)).toBe(
      true,
    );
    expect(drag.refocusKey.value).toBe("m");
    // A second move during the save is placed too.
    expect(drag.nudge(new KeyboardEvent("keydown", ALT_RIGHT), meeting)).toBe(
      true,
    );
    scope.stop();
  });

  it("drops the name once the chip has the focus after the save (m6)", async () => {
    const { drag, scope } = setup(vi.fn(async () => true));
    const button = chip();
    drag.nudge(new KeyboardEvent("keydown", ALT_RIGHT), meeting);
    button.focus();
    await Promise.resolve();
    await Promise.resolve();
    expect(drag.refocusKey.value).toBeNull();
    scope.stop();
  });

  it("asks again after a refusal while no chip has the focus", async () => {
    const { drag, scope } = setup(vi.fn(async () => false));
    drag.nudge(new KeyboardEvent("keydown", ALT_RIGHT), meeting);
    drag.refocusKey.value = null;
    await Promise.resolve();
    await Promise.resolve();
    expect(drag.refocusKey.value).toBe("m");
    scope.stop();
  });

  it("forgets the name when the range changes (m6)", async () => {
    const { drag, range, scope } = setup(
      vi.fn(() => new Promise<boolean>(() => {})),
    );
    drag.nudge(new KeyboardEvent("keydown", ALT_RIGHT), meeting);
    range.value = rangeOf("2026-11-02");
    await nextTick();
    expect(drag.refocusKey.value).toBeNull();
    scope.stop();
  });
});

describe("refocus after a mouse drag (m10)", () => {
  it("reads the focused chip at the drop: the click focused it after the press", () => {
    const { drag, scope } = setup(vi.fn(() => new Promise<boolean>(() => {})));
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
      resolve: (x, y) => ({
        day: x < 100 ? "2026-10-26" : "2026-10-27",
        minutes: y,
      }),
    });
    const button = chip();
    grid.append(button);
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        button: 0,
        buttons: type === "pointermove" ? 1 : 0,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      return event as PointerEvent;
    };
    const press = pointer("pointerdown", 10, 560);
    button.dispatchEvent(press);
    drag.startOccurrence(press, meeting, "move");
    button.focus();
    window.dispatchEvent(pointer("pointermove", 160, 560));
    window.dispatchEvent(pointer("pointerup", 160, 560));
    expect(drag.refocusKey.value).toBe("m");
    scope.stop();
  });
});
