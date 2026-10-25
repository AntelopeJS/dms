// @vitest-environment jsdom
/**
 * The timeline, year and list views of a FullAgenda drawn from a fake
 * context: rows and folding groups, an event spilling over to the next day,
 * empty-slot clicks and the drop surface; the year planner's cells, tooltips
 * and two-click range; the list's day headers.
 */
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaContext } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import { fakeAgendaContext } from "./agenda-view-context";
import { makeDays, makeOccurrence } from "./agenda-view-fixtures";

let ctx: AgendaContext;

vi.mock("../layers/dms-ui/app/build/composables/agenda/useAgenda", () => ({
  useAgendaContext: () => ctx,
}));
vi.mock(
  "../layers/dms-core/app/composables/translation/useComposedText",
  () => ({
    useComposedText: () => ({ processText: (text: unknown) => String(text) }),
  }),
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaEventChip.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return {
      default: define({
        props: ["occurrence", "layout", "continuesBefore", "continuesAfter"],
        setup: (props) => () =>
          render(
            "span",
            { class: "chip", "data-layout": props.layout },
            props.occurrence.event.title,
          ),
      }),
    };
  },
);
vi.mock(
  "../layers/dms-ui/app/build/components/agenda/AgendaGhost.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return {
      default: define({
        setup: () => () => render("span", { class: "ghost" }),
      }),
    };
  },
);

import AgendaTimelineView from "../layers/dms-ui/app/build/components/agenda/AgendaTimelineView.vue";
import AgendaYearView from "../layers/dms-ui/app/build/components/agenda/AgendaYearView.vue";
import AgendaListView from "../layers/dms-ui/app/build/components/agenda/AgendaListView.vue";

const Stub = defineComponent({
  inheritAttrs: false,
  props: {
    label: { type: String, default: undefined },
    name: { type: String, default: undefined },
  },
  setup:
    (props, { attrs }) =>
    () =>
      h(
        attrs.onClick ? "button" : "span",
        { class: attrs.class, onClick: attrs.onClick },
        props.label,
      ),
});

let app: App | undefined;

/** The texts of an element's child spans, joined by a space. */
const spanTexts = (element: Element) =>
  [...element.querySelectorAll(":scope > span")]
    .map((span) => span.textContent?.trim())
    .filter(Boolean)
    .join(" ");

function mount(component: unknown): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(() => h(component as never));
  for (const name of ["UIcon", "UButton"]) app.component(name, Stub);
  app.mount(host);
  return host;
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

const SLOTS = [
  { id: "S1", label: "S1", start: "08:00", end: "10:00" },
  { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  { id: "S3", label: "S3", start: "13:00", end: "15:00" },
  { id: "S4", label: "S4", start: "15:00", end: "17:00" },
];

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-GB"),
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("timeline view", () => {
  function planning() {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-22", 3, { hiddenDays: [0, 6] }),
      view: { scale: "slot" },
      slots: SLOTS,
      resources: [
        { id: "ann", label: "Ann", group: "arch", description: "Zone : Liège" },
        { id: "bob", label: "Bob", group: "draw" },
      ],
      resourceGroups: [
        { id: "arch", label: "Architectes" },
        { id: "draw", label: "Dessinateurs" },
      ],
      occurrences: [
        makeOccurrence({
          key: "peters",
          title: "Peters",
          start: "2026-10-22T13:00:00+02:00",
          end: "2026-10-23T17:00:00+02:00",
          resourceIds: ["ann"],
        }),
      ],
    });
    return mount(AgendaTimelineView);
  }

  it("draws group headers with counts, resources, slots and the spilling event in two segments", () => {
    const host = planning();
    const groups = [...host.querySelectorAll("button[aria-expanded]")];
    expect(groups.map((button) => spanTexts(button))).toEqual([
      "Architectes 1",
      "Dessinateurs 1",
    ]);
    expect(host.textContent).toContain("Zone : Liège");
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(13);
    const segments = host.querySelectorAll('[data-agenda-occurrence="peters"]');
    expect(segments).toHaveLength(2);
    expect((segments[0] as HTMLElement).style.left).toBe(`${(2 / 12) * 100}%`);
    expect((segments[1] as HTMLElement).style.left).toBe(`${(4 / 12) * 100}%`);
    expect(
      segments[1]!.querySelector(
        '[title="dms.agenda.timeline.continues_before"]',
      ),
    ).not.toBeNull();
  });

  it("folds a group through the context", async () => {
    const host = planning();
    (
      host.querySelector(
        'button[aria-label*="Dessinateurs"]',
      ) as HTMLButtonElement
    ).click();
    expect(ctx.toggleGroup).toHaveBeenCalledWith("draw");
    await nextTick();
    expect(host.textContent).not.toContain("Bob");
  });

  it("registers a drop surface and turns a click on empty time into a slot target", () => {
    const host = planning();
    expect(ctx.drag.registerSurface).toHaveBeenCalledTimes(1);
    const scroller = host.querySelector('[role="grid"]') as HTMLElement;
    const body = scroller.firstElementChild!.children[1] as HTMLElement;
    scroller.getBoundingClientRect = () => rect(0, 0, 1400, 600);
    body.getBoundingClientRect = () => rect(0, 56, 1400, 300);
    // Resource column 200 px, 12 slot columns of 100 px; the "ann" row is under the first group header (32 px).
    body.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: 200 + 650,
        clientY: 56 + 32 + 10,
      }),
    );
    expect(ctx.clickEmpty).toHaveBeenCalledWith(
      { day: "2026-10-23", minutes: 13 * 60, slotIndex: 2, resourceId: "ann" },
      false,
    );
    const surface = vi.mocked(ctx.drag.registerSurface).mock.calls[0]![0];
    expect(surface.resolve(100, 120)).toBeNull();
    expect(surface.resolve(200 + 50, 56 + 32 + 10)).toMatchObject({
      day: "2026-10-22",
      slotIndex: 0,
      resourceId: "ann",
    });
  });
});

describe("timeline on the DST day", () => {
  it("draws 24 hour columns and the now line at 10:00 CET on 2026-10-25", () => {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-25", 1, { today: "2026-10-25" }),
      view: { scale: "hour" },
      resources: [{ id: "ann", label: "Ann" }],
    });
    const host = mount(AgendaTimelineView);
    // The corner, then an hour per column; 02:00 lasts two hours.
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(25);
    const line = host.querySelector(".bg-error") as HTMLElement;
    expect(line.style.left).toBe(`${(10 / 24) * 100}%`);
  });
});

describe("timeline at scale", () => {
  it("mounts 60 resources over a week by hour, a few events each, quickly", () => {
    const days = makeDays("2026-10-26", 7);
    const resources = Array.from({ length: 60 }, (_, index) => ({
      id: `p${index}`,
      label: `Person ${index}`,
      group: `g${index % 6}`,
    }));
    const occurrences = resources.flatMap((resource) =>
      days.flatMap((day) =>
        [9, 14].map((hour) =>
          makeOccurrence({
            key: `${resource.id}-${day.key}-${hour}`,
            start: new Date(day.start + hour * 3_600_000).toISOString(),
            end: new Date(day.start + (hour + 3) * 3_600_000).toISOString(),
            resourceIds: [resource.id],
          }),
        ),
      ),
    );
    ctx = fakeAgendaContext({
      days,
      view: { scale: "hour", dayStart: "07:00", dayEnd: "20:00" },
      resources,
      resourceGroups: Array.from({ length: 6 }, (_, index) => ({
        id: `g${index}`,
        label: `G${index}`,
      })),
      occurrences,
    });
    const started = performance.now();
    const host = mount(AgendaTimelineView);
    const elapsed = performance.now() - started;
    expect(host.querySelectorAll('[role="rowheader"]')).toHaveLength(66);
    expect(host.querySelectorAll("[data-agenda-occurrence]")).toHaveLength(840);
    expect(elapsed).toBeLessThan(4000);
  });
});

describe("year view", () => {
  function leave(raw = {}) {
    ctx = fakeAgendaContext({
      days: makeDays("2026-01-01", 365),
      view: { type: "year", yearLayout: "planner" },
      today: "2026-10-25",
      raw,
      occurrences: [
        makeOccurrence({
          key: "leave",
          title: "Congé",
          start: "2026-10-26",
          end: "2026-10-30",
          allDay: true,
          short: "7,6",
        }),
      ],
      backgrounds: [
        {
          id: "toussaint",
          start: "2026-11-01",
          kind: "holiday",
          label: "Toussaint",
        },
      ],
    });
    return mount(AgendaYearView);
  }

  it("draws twelve months of 31 cells, the days a month lacks hatched", () => {
    const host = leave();
    expect(host.querySelectorAll('[role="rowheader"]')).toHaveLength(12);
    expect(host.querySelectorAll('[aria-disabled="true"]')).toHaveLength(7);
    expect(host.querySelectorAll("[data-agenda-day]")).toHaveLength(365);
    const today = host.querySelector('[data-agenda-day="2026-10-25"]')!;
    expect(today.className).toContain("outline-primary");
    expect(today.className).toContain("bg-elevated");
  });

  it("paints event days with their short label and names days in the tooltip", () => {
    const host = leave();
    const monday = host.querySelector(
      '[data-agenda-day="2026-10-26"]',
    ) as HTMLElement;
    expect(monday.textContent?.trim()).toBe("7,6");
    expect(monday.title).toBe("26/10/2026 · Congé");
    expect(monday.style.backgroundColor).toBe("rgb(26, 61, 153)");
    const holiday = host.querySelector(
      '[data-agenda-day="2026-11-01"]',
    ) as HTMLElement;
    expect(holiday.title).toBe("01/11/2026 · Toussaint");
    monday.click();
    expect(ctx.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: "leave" }),
    );
  });

  it("highlights a pending two-click range and hints at the last day", async () => {
    const host = leave({ rangeSelect: "twoClicks" });
    const first = host.querySelector(
      '[data-agenda-day="2026-12-07"]',
    ) as HTMLElement;
    first.click();
    expect(ctx.clickEmpty).toHaveBeenCalledWith(
      { day: "2026-12-07", allDay: true },
      false,
    );
    ctx.rangeAnchor.value = { day: "2026-12-07" };
    await nextTick();
    expect(host.textContent).toContain("dms.agenda.year.pick_last_day");
    host
      .querySelector('[data-agenda-day="2026-12-09"]')!
      .dispatchEvent(new Event("pointerenter"));
    await nextTick();
    const inside = host.querySelector('[data-agenda-day="2026-12-08"]')!;
    expect(inside.className).toContain("ring-primary");
    expect(
      host.querySelector('[data-agenda-day="2026-12-10"]')!.className,
    ).not.toContain("ring-primary");
    // With a range pending, even an event day ends it rather than opening the event.
    (
      host.querySelector('[data-agenda-day="2026-10-27"]') as HTMLElement
    ).click();
    expect(ctx.open).not.toHaveBeenCalled();
    expect(ctx.clickEmpty).toHaveBeenLastCalledWith(
      { day: "2026-10-27", allDay: true },
      false,
    );
  });

  it("draws twelve small months with dots", () => {
    ctx = fakeAgendaContext({
      days: makeDays("2026-01-01", 365),
      view: { type: "year", yearLayout: "months" },
      occurrences: [
        makeOccurrence({
          key: "m",
          start: "2026-10-27T09:00:00+01:00",
          end: "2026-10-27T10:00:00+01:00",
        }),
      ],
    });
    const host = mount(AgendaYearView);
    expect(host.querySelectorAll("section")).toHaveLength(12);
    const day = host.querySelector('[data-agenda-day="2026-10-27"]')!;
    expect(day.querySelectorAll(".rounded-full")).toHaveLength(1);
  });
});

describe("list view", () => {
  it("lists the days that hold events under day headers, today named", () => {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-25", 7, { today: "2026-10-25" }),
      view: { type: "list" },
      occurrences: [
        makeOccurrence({
          key: "standup",
          title: "Standup",
          start: "2026-10-25T09:00:00+01:00",
          end: "2026-10-25T09:15:00+01:00",
        }),
        makeOccurrence({
          key: "leave",
          title: "Leave",
          start: "2026-10-27",
          end: "2026-10-27",
          allDay: true,
        }),
      ],
    });
    const host = mount(AgendaListView);
    const headers = [...host.querySelectorAll("h3")].map(spanTexts);
    expect(headers).toEqual([
      "dms.agenda.list.today long:2026-10-25",
      "weekday:2026-10-27 long:2026-10-27",
    ]);
    expect(host.textContent).toContain("09:00 – 09:15");
    expect(host.textContent).toContain("dms.agenda.list.all_day");
    (
      host.querySelector('[data-agenda-occurrence="standup"]') as HTMLElement
    ).click();
    expect(ctx.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: "standup" }),
    );
  });

  it("says so when the range has no events", () => {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-25", 7),
      view: { type: "list" },
    });
    expect(mount(AgendaListView).textContent).toContain(
      "dms.agenda.list.empty",
    );
  });
});
