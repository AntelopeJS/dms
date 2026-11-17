/** @vitest-environment jsdom */
/**
 * The timeline, year and list views of a FullAgenda drawn from a fake
 * context: rows and folding groups, an event spilling over to the next day,
 * empty-slot clicks and the drop surface; the year planner's cells, tooltips
 * and two-click range; the list's day headers.
 */
import type { NamedValue } from "vue-i18n";
import { AGENDA_CONTEXT_KEY } from "./fixtures/agendaRuntime";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaContext } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import { fakeAgendaContext } from "./agenda-view-context";
import { makeDays, makeOccurrence } from "./agenda-view-fixtures";

let ctx: AgendaContext;

import AgendaTimelineView from "../layers/dms-ui/app/entries/components/agenda/AgendaTimelineView";
import AgendaYearView from "../layers/dms-ui/app/entries/components/agenda/AgendaYearView";
import AgendaListView from "../layers/dms-ui/app/entries/components/agenda/AgendaListView";

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
  [...element.querySelectorAll<HTMLElement>(":scope > span")]
    .map((span) => span.textContent?.trim())
    .filter(Boolean)
    .join(" ");

function mount(component: Component): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  app = createApp(() => h(component));
  for (const name of ["UIcon", "UButton"]) app.component(name, Stub);
  app.provide(AGENDA_CONTEXT_KEY, ctx);
  app.mount(host);
  return host;
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return new DOMRect(left, top, width, height);
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
    t: (key: string, params?: NamedValue) =>
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
    const groups = [
      ...host.querySelectorAll<HTMLElement>("button[aria-expanded]"),
    ];
    expect(groups.map((button) => spanTexts(button))).toEqual([
      "Architectes 1",
      "Dessinateurs 1",
    ]);
    expect(host.textContent).toContain("Zone : Liège");
    expect(
      host.querySelectorAll<HTMLElement>('[role="columnheader"]'),
    ).toHaveLength(13);
    const segments = host.querySelectorAll<HTMLElement>(
      'div[data-agenda-occurrence="peters"]',
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]!.style.left).toBe(`${(2 / 12) * 100}%`);
    expect(segments[1]!.style.left).toBe(`${(4 / 12) * 100}%`);
    expect(
      segments[1]!.querySelector(
        '[title="dms.agenda.timeline.continues_before"]',
      ),
    ).not.toBeNull();
  });

  it("folds a group through the context", async () => {
    const host = planning();
    host
      .querySelector<HTMLButtonElement>('button[aria-label*="Dessinateurs"]')!
      .click();
    expect(ctx.toggleGroup).toHaveBeenCalledWith("draw");
    await nextTick();
    expect(host.textContent).not.toContain("Bob");
  });

  it("registers a drop surface and turns a click on empty time into a slot target", () => {
    const host = planning();
    expect(ctx.drag.registerSurface).toHaveBeenCalledTimes(1);
    const scroller = host.querySelector<HTMLElement>('[role="grid"]')!;
    const body = scroller.firstElementChild?.children[1];
    if (!(body instanceof HTMLElement)) throw new Error("the grid has a body");
    scroller.getBoundingClientRect = () => rect(0, 0, 1400, 600);
    body.getBoundingClientRect = () => rect(0, 56, 1400, 300);
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

describe("timeline rows and notices", () => {
  function roster(subtitle?: string) {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-26", 1),
      view: { scale: "hour" },
      resources: [{ id: "ann", label: "Ann" }],
      occurrences: [
        {
          ...makeOccurrence({
            key: "peters",
            title: "Peters",
            start: "2026-10-26T09:00:00+01:00",
            end: "2026-10-26T11:00:00+01:00",
            resourceIds: ["ann"],
          }),
          event: { id: "peters", title: "Peters", start: "", subtitle },
        },
      ],
    });
    return mount(AgendaTimelineView);
  }

  it("gives lanes two lines when an event has a subtitle, one otherwise", () => {
    const twoLines = roster("DC-Dessin-AP1");
    const row = twoLines.querySelector<HTMLElement>(
      '[data-agenda-resource="ann"]',
    )!;
    expect(row.style.height).toBe("54px");
    app?.unmount();
    const oneLine = roster();
    const plain = oneLine.querySelector<HTMLElement>(
      '[data-agenda-resource="ann"]',
    )!;
    expect(plain.style.height).toBe("48px");
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
    expect(
      host.querySelectorAll<HTMLElement>('[role="columnheader"]'),
    ).toHaveLength(25);
    const line = host.querySelector<HTMLElement>(".bg-error")!;
    expect(line.style.left).toBe(`${(10 / 24) * 100}%`);
  });
});

describe("timeline at scale", () => {
  it("draws every row and event of 60 resources over a week by hour (fails when a grouped row or an event is left out)", () => {
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
    const host = mount(AgendaTimelineView);
    expect(
      host.querySelectorAll<HTMLElement>('[role="rowheader"]'),
    ).toHaveLength(66);
    expect(
      host.querySelectorAll<HTMLElement>("div[data-agenda-occurrence]"),
    ).toHaveLength(840);
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
    expect(
      host.querySelectorAll<HTMLElement>('[role="rowheader"]'),
    ).toHaveLength(12);
    expect(
      host.querySelectorAll<HTMLElement>('[aria-disabled="true"]'),
    ).toHaveLength(7);
    expect(
      host.querySelectorAll<HTMLElement>("[data-agenda-day]"),
    ).toHaveLength(365);
    const today = host.querySelector('[data-agenda-day="2026-10-25"]')!;
    expect(today.className).toContain("outline-primary");
    expect(today.className).toContain("bg-elevated");
  });

  it("paints event days with their short label and names days in the tooltip", () => {
    const host = leave();
    const monday = host.querySelector<HTMLElement>(
      '[data-agenda-day="2026-10-26"]',
    )!;
    expect(monday.textContent?.trim()).toBe("7,6");
    expect(monday.title).toBe("26/10/2026 · Congé");
    expect(monday.style.backgroundColor).toBe("rgb(26, 61, 153)");
    const holiday = host.querySelector<HTMLElement>(
      '[data-agenda-day="2026-11-01"]',
    )!;
    expect(holiday.title).toBe("01/11/2026 · Toussaint");
    monday.click();
    expect(ctx.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: "leave" }),
    );
  });

  it("highlights a pending two-click range and hints at the last day", async () => {
    const host = leave({ rangeSelect: "twoClicks" });
    const first = host.querySelector<HTMLElement>(
      '[data-agenda-day="2026-12-07"]',
    )!;
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
    host.querySelector<HTMLElement>('[data-agenda-day="2026-10-27"]')!.click();
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
    expect(host.querySelectorAll<HTMLElement>("section")).toHaveLength(12);
    const day = host.querySelector('[data-agenda-day="2026-10-27"]')!;
    expect(day.querySelectorAll<HTMLElement>(".rounded-full")).toHaveLength(1);
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
    const headers = [...host.querySelectorAll<HTMLElement>("h3")].map(
      spanTexts,
    );
    expect(headers).toEqual([
      "dms.agenda.list.today long:2026-10-25",
      "weekday:2026-10-27 long:2026-10-27",
    ]);
    expect(host.textContent).toContain("09:00 – 09:15");
    expect(host.textContent).toContain("dms.agenda.list.all_day");
    host
      .querySelector<HTMLElement>('[data-agenda-occurrence="standup"]')!
      .click();
    expect(ctx.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: "standup" }),
    );
  });

  it("says nothing while the first answer is loading", () => {
    ctx = fakeAgendaContext({
      days: makeDays("2026-10-25", 7),
      view: { type: "list" },
      loading: true,
    });
    expect(mount(AgendaListView).textContent).not.toContain(
      "dms.agenda.list.empty",
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
