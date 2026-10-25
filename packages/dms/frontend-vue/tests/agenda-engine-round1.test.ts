// @vitest-environment jsdom
/**
 * Fix round 1 of the FullAgenda engine (critic items in brackets): series
 * expanded in their own zone (#3), changes queued behind a create or a
 * detach (#4), refusals and conflicts never stuck (#5), cleared fields
 * (#6), an occurrence changed alone kept on its day (#7), the keyboard
 * focus following the DOM (#9), short views off hidden days (#16), a series
 * moved in zoned days (#18), no Undo without an id (#20), what a Save
 * sends (#22), slot indices and pointer instants (#29), colours (#39),
 * aria-labels (#40), ICS entities (#61) and plain spaces in formats.
 */
import { effectScope, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOccurrences,
  type AgendaNormalizeSettings,
} from "../layers/dms-ui/app/build/composables/agenda/agendaOccurrences";
import {
  applyChange,
  inverseChange,
  overlayEdits,
  patchEvent,
  previousOf,
} from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import { completeChange } from "../layers/dms-ui/app/build/composables/agenda/agendaApply";
import { useAgendaShortcuts } from "../layers/dms-ui/app/build/composables/agenda/useAgendaShortcuts";
import {
  resolveAgendaViews,
  stepAnchor,
} from "../layers/dms-ui/app/build/composables/agenda/agendaRange";
import { resolveAgendaOptions } from "../layers/dms-ui/app/build/composables/agenda/agendaOptions";
import { placementOfTarget } from "../layers/dms-ui/app/build/composables/agenda/agendaPlacement";
import { agendaColorCss } from "../layers/dms-ui/app/build/composables/agenda/agendaPaint";
import { describeOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaDescribe";
import {
  buildAgendaIcs,
  decodeEntities,
} from "../layers/dms-ui/app/build/composables/agenda/agendaIcs";
import {
  formatAgendaDaySpan,
  formatAgendaTime,
} from "../layers/dms-ui/app/build/composables/agenda/agendaFormat";
import {
  addDays,
  dayStartEpoch,
} from "../layers/dms-ui/app/build/composables/agenda/agendaTime";
import type {
  AgendaOccurrence,
  ResolvedAgendaView,
} from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type {
  AgendaChange,
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
  FullAgendaOptions,
} from "../layers/dms-ui/app/types/full-agenda";

const BRUSSELS = "Europe/Brussels";
const TOKYO = "Asia/Tokyo";
const NEW_YORK = "America/New_York";

function settingsFor(
  from: string,
  to: string,
  timeZone: string,
): AgendaNormalizeSettings {
  return {
    timeZone,
    from,
    to,
    start: dayStartEpoch(from, timeZone),
    end: dayStartEpoch(addDays(to, 1), timeZone),
    defaultDurationMinutes: 60,
    editable: true,
    dragMove: true,
    dragResize: true,
    detailsContainer: "drawer",
    calendars: new Map(),
    resources: new Map(),
  };
}

describe("#3 a series is expanded in its own zone", () => {
  const monday: AgendaEvent = {
    id: "s",
    title: "Monday review",
    start: "2026-10-19T20:00:00+02:00",
    end: "2026-10-19T21:00:00+02:00",
    recurrence: {
      frequency: "weekly",
      weekdays: [1],
      timeZone: BRUSSELS,
    },
  };

  it("keeps a Brussels Monday 20:00 on Monday 20:00 Brussels for a Tokyo reader", () => {
    const [occurrence] = buildOccurrences(
      [monday],
      settingsFor("2026-10-26", "2026-11-01", TOKYO),
    );
    expect(occurrence!.key).toBe("s@2026-10-26");
    expect(occurrence!.recurring!.occurrence).toBe("2026-10-26");
    expect(occurrence!.start).toBe(Date.parse("2026-10-26T19:00:00Z"));
    // Drawn on the Tokyo day it falls on: Tuesday 04:00.
    expect(occurrence!.startDay).toBe("2026-10-27");
    expect(occurrence!.startMinutes).toBe(4 * 60);
  });

  it("compares exceptions with the series' days, not the reader's", () => {
    const excepted = {
      ...monday,
      recurrence: { ...monday.recurrence!, exceptions: ["2026-10-26"] },
    };
    expect(
      buildOccurrences(
        [excepted],
        settingsFor("2026-10-26", "2026-11-01", TOKYO),
      ),
    ).toHaveLength(0);
  });

  it("keeps a 09:00 Brussels standup at 08:00Z for a New York reader after the EU change", () => {
    const standup: AgendaEvent = {
      id: "standup",
      title: "Standup",
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T09:15:00+02:00",
      recurrence: {
        frequency: "weekly",
        weekdays: [1, 2, 3, 4, 5],
        timeZone: BRUSSELS,
      },
    };
    const occurrences = buildOccurrences(
      [standup],
      settingsFor("2026-10-27", "2026-10-27", NEW_YORK),
    );
    expect(occurrences.map((entry) => entry.key)).toEqual([
      "standup@2026-10-27",
    ]);
    expect(occurrences[0]!.start).toBe(Date.parse("2026-10-27T08:00:00Z"));
    expect(occurrences[0]!.startMinutes).toBe(4 * 60);
  });

  it("uses the agenda's zone for a series that names none", () => {
    const own = { ...monday, recurrence: { frequency: "weekly" as const } };
    const [occurrence] = buildOccurrences(
      [own],
      settingsFor("2026-10-26", "2026-11-01", BRUSSELS),
    );
    expect(occurrence!.start).toBe(Date.parse("2026-10-26T19:00:00Z"));
  });
});

interface Pending {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse) => void;
}

function engineHarness(mode: "immediate" | "staged" = "immediate") {
  const pending: Pending[] = [];
  const engine = createAgendaSaveEngine({
    mode: () => mode,
    send: (request) =>
      new Promise((resolve) => pending.push({ request, resolve })),
    context: () => ({
      conflicts: "detect",
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
    }),
    confirm: async () => true,
    onAnswer: () => undefined,
    describeError: () => "failed",
    text: (message) => String(message),
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()!.resolve(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { engine, pending, answer };
}

describe("#4 a change queued behind a create or a detach", () => {
  it("goes to the id the route gave the new event", async () => {
    const { engine, pending, answer } = engineHarness();
    void engine.record({
      kind: "create",
      tempId: "tmp-1",
      patch: { title: "New" },
    });
    void engine.record({
      kind: "move",
      id: "tmp-1",
      patch: { start: "2026-10-21T10:00:00+02:00" },
      previous: { start: "2026-10-21T09:00:00+02:00" },
    });
    expect(pending).toHaveLength(1);
    await answer({
      events: [{ id: "srv-1", tempId: "tmp-1", title: "New", start: "" }],
    });
    expect(pending[0]!.request.changes[0]).toMatchObject({
      kind: "move",
      id: "srv-1",
    });
  });

  it("deletes the created event by its answered id", async () => {
    const { engine, pending, answer } = engineHarness();
    void engine.record({
      kind: "create",
      tempId: "tmp-2",
      patch: { title: "New" },
    });
    void engine.record({ kind: "delete", id: "tmp-2" });
    await answer({
      events: [{ id: "srv-2", tempId: "tmp-2", title: "New", start: "" }],
    });
    expect(pending[0]!.request.changes[0]).toMatchObject({
      kind: "delete",
      id: "srv-2",
    });
  });

  const detach: AgendaChange = {
    kind: "move",
    id: "s",
    occurrence: "2026-10-27",
    scope: "occurrence",
    patch: {
      start: "2026-10-27T15:00:00+01:00",
      end: "2026-10-27T15:15:00+01:00",
    },
    previous: {
      start: "2026-10-27T09:00:00+01:00",
      end: "2026-10-27T09:15:00+01:00",
    },
  };
  const rename: AgendaChange = {
    kind: "update",
    id: "s@2026-10-27",
    patch: { title: "Renamed" },
    previous: { title: "Standup" },
  };

  it("goes to the detached occurrence's answered id", async () => {
    const { engine, pending, answer } = engineHarness();
    void engine.record(detach);
    void engine.record(rename);
    await answer({
      events: [
        { id: "s", title: "Standup", start: "2026-10-19T09:00:00+02:00" },
        {
          id: "s-2026-10-27",
          title: "Standup",
          start: "2026-10-27T15:00:00+01:00",
        },
      ],
    });
    expect(pending[0]!.request.changes[0]).toMatchObject({
      kind: "update",
      id: "s-2026-10-27",
      patch: { title: "Renamed" },
    });
  });

  it("detaches again with every field when the route answered no id", async () => {
    const { engine, pending, answer } = engineHarness();
    void engine.record(detach);
    void engine.record(rename);
    await answer({});
    expect(pending[0]!.request.changes[0]).toEqual({
      kind: "update",
      id: "s",
      occurrence: "2026-10-27",
      scope: "occurrence",
      patch: {
        start: "2026-10-27T15:00:00+01:00",
        end: "2026-10-27T15:15:00+01:00",
        title: "Renamed",
      },
      previous: detach.previous,
    });
  });
});

describe("#6 cleared fields", () => {
  const event: AgendaEvent = {
    id: "a",
    title: "A",
    start: "2026-10-20T09:00:00+02:00",
    location: "Room 1",
    data: { remark: "x" },
  };

  it("names a field the event does not hold as null in previous", () => {
    expect(
      previousOf(event, {
        end: "2026-10-20T11:00:00+02:00",
        location: null,
        calendarId: "c",
        allDay: true,
        data: { remark: null, dossier: "1" },
      }),
    ).toEqual({
      end: null,
      location: "Room 1",
      calendarId: null,
      allDay: false,
      data: { remark: "x", dossier: null },
    });
  });

  it("clears a field and a data key set to null", () => {
    expect(
      patchEvent(event, { location: null, data: { remark: null } }),
    ).toEqual({
      id: "a",
      title: "A",
      start: "2026-10-20T09:00:00+02:00",
      data: {},
    });
  });

  it("gives the Undo of a move of an event without end a null end", () => {
    const change = completeChange({
      change: {
        kind: "move",
        id: "a",
        patch: {
          start: "2026-10-21T09:00:00+02:00",
          end: "2026-10-21T10:00:00+02:00",
        },
      },
      event,
      timeZone: BRUSSELS,
    });
    expect(inverseChange(change, undefined, () => "t")!.patch).toEqual({
      start: "2026-10-20T09:00:00+02:00",
      end: null,
    });
  });
});

describe("#7 an occurrence changed alone stays on its own day", () => {
  const series: AgendaEvent = {
    id: "s",
    title: "Standup",
    start: "2026-10-19T09:00:00+02:00",
    end: "2026-10-19T09:15:00+02:00",
    recurrence: { frequency: "daily" },
  };

  it("is drawn on its day at its time when only its title changes", () => {
    const settings = settingsFor("2026-10-26", "2026-10-28", BRUSSELS);
    const occurrence = buildOccurrences([series], settings).find(
      (entry) => entry.key === "s@2026-10-27",
    )!;
    const change = completeChange({
      change: {
        kind: "update",
        id: "s",
        occurrence: "2026-10-27",
        patch: { title: "Renamed" },
      },
      occurrence,
      scope: "occurrence",
      timeZone: BRUSSELS,
    });
    expect(change.patch).toMatchObject({
      title: "Renamed",
      start: "2026-10-27T09:00:00+01:00",
      end: "2026-10-27T09:15:00+01:00",
    });
    const { events } = overlayEdits(
      [series],
      [{ key: "s@2026-10-27", status: "staged", change }],
      "staged",
      BRUSSELS,
    );
    const renamed = buildOccurrences(events, settings).find(
      (entry) => entry.event.title === "Renamed",
    )!;
    expect(renamed.startDay).toBe("2026-10-27");
    expect(renamed.startMinutes).toBe(540);
  });
});

describe("#9 the keyboard follows the DOM focus", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  function mount() {
    document.body.innerHTML = `
      <div data-dms-agenda>
        <button id="today">Today</button>
        <button data-agenda-occurrence="a">A</button>
        <button data-agenda-occurrence="b">B</button>
      </div>`;
    const root = document.querySelector<HTMLElement>("[data-dms-agenda]")!;
    const occurrences = ["a", "b"].map(
      (key) => ({ key, canDelete: true }) as AgendaOccurrence,
    );
    const calls = { go: vi.fn(), open: vi.fn(), remove: vi.fn() };
    const focusedKey = ref<string | null>(null);
    const scope = effectScope();
    scope.run(() =>
      useAgendaShortcuts({
        root: ref(root),
        enabled: () => true,
        isStaged: () => false,
        views: () => [],
        occurrences: () => occurrences,
        focusedKey,
        goToday: vi.fn(),
        go: calls.go,
        setView: vi.fn(),
        createNew: vi.fn(),
        open: calls.open,
        remove: calls.remove,
        saveStaged: vi.fn(),
        hasStaged: () => false,
        cancel: vi.fn(),
      }),
    );
    stop = () => scope.stop();
    const press = (target: Element, key: string) =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    return { root, calls, focusedKey, press };
  }

  it("moves the DOM focus with the arrows, and opens the chip it is on", () => {
    const { root, calls, focusedKey, press } = mount();
    const chipA = root.querySelector<HTMLElement>(
      '[data-agenda-occurrence="a"]',
    )!;
    chipA.focus();
    press(chipA, "ArrowRight");
    expect(focusedKey.value).toBe("b");
    expect(document.activeElement?.getAttribute("data-agenda-occurrence")).toBe(
      "b",
    );
    press(document.activeElement!, "Enter");
    expect(calls.open).toHaveBeenCalledWith(
      expect.objectContaining({ key: "b" }),
    );
    expect(calls.go).not.toHaveBeenCalled();
  });

  it("forgets the chip once the focus left it: Enter, Backspace and arrows act on what has the focus", () => {
    const { root, calls, focusedKey, press } = mount();
    const chipA = root.querySelector<HTMLElement>(
      '[data-agenda-occurrence="a"]',
    )!;
    chipA.focus();
    press(chipA, "ArrowRight");
    const today = root.querySelector<HTMLElement>("#today")!;
    today.focus();
    press(today, "Enter");
    expect(calls.open).not.toHaveBeenCalled();
    expect(focusedKey.value).toBeNull();
    today.blur();
    press(document.body, "Backspace");
    expect(calls.remove).not.toHaveBeenCalled();
    press(document.body, "ArrowRight");
    expect(calls.go).toHaveBeenCalledWith(1);
  });
});

describe("#16 a view shorter than a week skips hidden days", () => {
  const view = (entry: NonNullable<FullAgendaOptions["views"]>[number]) =>
    resolveAgendaViews([entry], { hiddenDays: [0, 6] }, () => "")[0]!;

  it("steps a one-day resources view from Friday to Monday and back", () => {
    const resources = view("resources");
    expect(stepAnchor(resources, "2026-10-30", 1)).toBe("2026-11-02");
    expect(stepAnchor(resources, "2026-11-02", -1)).toBe("2026-10-30");
  });

  it("lands a three-day view on the next shown day", () => {
    expect(
      stepAnchor(view({ type: "days", duration: 3 }), "2026-10-22", 1),
    ).toBe("2026-10-26");
  });
});

describe("#18 a series moved through an occurrence, in zoned days and wall time", () => {
  it("moves a one-weekday series by the days, its weekday following, at 09:00 across DST", () => {
    const friday: AgendaEvent = {
      id: "f",
      title: "Friday",
      start: "2026-10-23T09:00:00+02:00",
      end: "2026-10-23T10:00:00+02:00",
      recurrence: { frequency: "weekly", weekdays: [5], timeZone: BRUSSELS },
    };
    const [moved] = applyChange(
      [friday],
      {
        kind: "move",
        id: "f",
        occurrence: "2026-10-23",
        scope: "series",
        patch: {
          start: "2026-10-26T09:00:00+01:00",
          end: "2026-10-26T10:00:00+01:00",
        },
        previous: {
          start: "2026-10-23T09:00:00+02:00",
          end: "2026-10-23T10:00:00+02:00",
        },
      },
      undefined,
      BRUSSELS,
    );
    expect(moved).toMatchObject({
      start: "2026-10-26T09:00:00+01:00",
      end: "2026-10-26T10:00:00+01:00",
      recurrence: { weekdays: [1] },
    });
  });

  it("keeps the days of a series on several weekdays and takes the new time", () => {
    const standup: AgendaEvent = {
      id: "s",
      title: "Standup",
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T09:15:00+02:00",
      recurrence: { frequency: "weekly", weekdays: [1, 2, 3, 4, 5] },
    };
    const [moved] = applyChange(
      [standup],
      {
        kind: "move",
        id: "s",
        occurrence: "2026-10-23",
        scope: "series",
        patch: {
          start: "2026-10-26T10:00:00+01:00",
          end: "2026-10-26T10:15:00+01:00",
        },
        previous: {
          start: "2026-10-23T09:00:00+02:00",
          end: "2026-10-23T09:15:00+02:00",
        },
      },
      undefined,
      BRUSSELS,
    );
    expect(moved).toMatchObject({
      start: "2026-10-19T10:00:00+02:00",
      end: "2026-10-19T10:15:00+02:00",
      recurrence: { weekdays: [1, 2, 3, 4, 5] },
    });
  });
});

describe("#20 #22 Undo and what a Save sends", () => {
  it("offers no Undo for a create the route answered without an id", () => {
    expect(
      inverseChange(
        { kind: "create", tempId: "tmp-1", patch: {} },
        undefined,
        () => "t",
      ),
    ).toBeNull();
  });

  it("counts the staged and refused changes, not a conflict", async () => {
    const { engine } = engineHarness("staged");
    void engine.record({
      kind: "update",
      id: "a",
      patch: { title: "A2" },
      previous: { title: "A" },
    });
    void engine.record({
      kind: "update",
      id: "b",
      patch: { title: "B2" },
      previous: { title: "B" },
    });
    const edit = engine.editOf("b")!;
    edit.status = "conflict";
    expect(engine.sendable.value.map((entry) => entry.key)).toEqual(["a"]);
  });
});

describe("#29 placements", () => {
  const options = resolveAgendaOptions(
    {
      saveUrl: "/s",
      slots: [
        { id: "S3", label: "S3", start: "13:00", end: "15:00" },
        { id: "S1", label: "S1", start: "08:00", end: "10:00" },
      ],
    },
    resolveAgendaViews(["timeline"], {}, () => "")[0] as ResolvedAgendaView,
    { timeZone: BRUSSELS, weekStartsOn: 1 },
  );

  it("reads a slot index as the views order the slots", () => {
    expect(
      placementOfTarget(
        { day: "2026-10-26", slotIndex: 0, minutes: 480 },
        options,
      ),
    ).toMatchObject({ start: Date.parse("2026-10-26T07:00:00Z") });
  });

  it("creates at the instant under the pointer (the second 02:30), and on no resource for the unassigned row", () => {
    const second = Date.parse("2026-10-25T01:30:00Z");
    expect(
      placementOfTarget(
        {
          day: "2026-10-25",
          minutes: 150,
          instant: second,
          resourceId: "x",
          unassigned: true,
        },
        options,
      ),
    ).toMatchObject({ start: second, resourceIds: [] });
  });
});

describe("#39 #40 #61 colours, labels, ICS, spaces", () => {
  it("takes tones in any case and falls back to primary for what is not a colour", () => {
    expect(agendaColorCss("Primary" as never)).toBe("var(--ui-primary)");
    expect(agendaColorCss("bleu" as never)).toBe("var(--ui-primary)");
    expect(agendaColorCss("var(--brand-teal)")).toBe("var(--brand-teal)");
    expect(agendaColorCss("#1A7A4A")).toBe("#1A7A4A");
  });

  it("names both days of a timed event over several days", () => {
    const [occurrence] = buildOccurrences(
      [
        {
          id: "x",
          title: "Offsite",
          start: "2026-10-26T10:00:00+01:00",
          end: "2026-10-28T12:00:00+01:00",
        },
      ],
      settingsFor("2026-10-26", "2026-10-28", BRUSSELS),
    );
    const label = describeOccurrence(occurrence!, {
      format: { day: (key) => key, time: () => "t" },
      t: (key, params) =>
        `${key.split(".").at(-1)}(${Object.values(params ?? {}).join("|")})`,
      calendarLabel: () => "",
    });
    expect(label).toBe("event(Offsite|timed_days(2026-10-26|t|2026-10-28|t))");
  });

  it("decodes entities in the ICS description", () => {
    expect(decodeEntities("A &amp; B &#233; &#x2014; &lt;b&gt;")).toBe(
      "A & B é — <b>",
    );
    const [occurrence] = buildOccurrences(
      [
        {
          id: "x",
          title: "T",
          start: "2026-10-26T10:00:00+01:00",
          description: "<p>Tom &amp; Jerry</p>",
        },
      ],
      settingsFor("2026-10-26", "2026-10-26", BRUSSELS),
    );
    expect(buildAgendaIcs([occurrence!], { now: 0 })).toContain(
      "DESCRIPTION:Tom & Jerry",
    );
  });

  it("writes plain spaces, as a browser and the server read alike", () => {
    expect(
      formatAgendaDaySpan("2026-09-28", "2026-10-04", "en-GB"),
    ).not.toMatch(/[\u00a0\u2009\u202f]/);
    expect(
      formatAgendaTime(Date.parse("2026-10-25T08:30:00Z"), {
        locale: "en-US",
        timeZone: BRUSSELS,
        hourCycle: "h12",
      }),
    ).toBe("9:30 AM");
  });
});
