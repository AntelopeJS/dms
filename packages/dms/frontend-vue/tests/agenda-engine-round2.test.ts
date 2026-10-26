// @vitest-environment jsdom
/**
 * Fix round 2 of the FullAgenda engine (critic items in brackets): the
 * series rules shared with the playground's routes, on E's own scenarios
 * (N10, N11, N26, N27, N37, N38), two series changes merged (N9), the save
 * queue's corners (N2, N20, N25), an Undo's `previous` (N16), the keyboard
 * in drawn order (N13), one colour check (N31), a period clamped to
 * `minDate` / `maxDate` (L4), save answers laid over an older read (N8),
 * and the save status (N23).
 */
import { effectScope, reactive, computed, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyChange,
  mergeChanges,
} from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import { completeChange } from "../layers/dms-ui/app/build/composables/agenda/agendaApply";
import { useAgendaShortcuts } from "../layers/dms-ui/app/build/composables/agenda/useAgendaShortcuts";
import { agendaColorCss } from "../layers/dms-ui/app/build/composables/agenda/agendaPaint";
import { clampDays } from "../layers/dms-ui/app/build/composables/agenda/agendaRange";
import { layerAnswers } from "../layers/dms-ui/app/build/composables/agenda/agendaData";
import { useAgendaSaveStatus } from "../layers/dms-ui/app/build/composables/agenda/useAgendaSaveStatus";
import type { AgendaSaveEngine } from "../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import type { AgendaEdit } from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import type { AgendaOccurrence } from "../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

const BXL = "Europe/Brussels";

const series = (fields: Partial<AgendaEvent>): AgendaEvent => ({
  id: "s",
  title: "S",
  start: "",
  ...fields,
});

/** A series changed through an occurrence, as the routes receive it (no `previous`). */
function bySeries(
  event: AgendaEvent,
  occurrence: string,
  patch: AgendaEventPatch,
): AgendaEvent {
  const change: AgendaChange = {
    kind: "move",
    id: event.id,
    occurrence,
    scope: "series",
    patch,
  };
  return applyChange([event], change, undefined, BXL)[0]!;
}

describe("series rules shared with the routes (E's scenarios)", () => {
  it("N10: a multi-weekday series moved across midnight ends after it starts", () => {
    const moved = bySeries(
      series({
        start: "2026-10-19T09:00:00+02:00",
        end: "2026-10-19T09:15:00+02:00",
        recurrence: {
          frequency: "weekly",
          weekdays: [1, 2, 3, 4, 5],
          timeZone: BXL,
        },
      }),
      "2026-10-27",
      { start: "2026-10-27T23:50:00+01:00", end: "2026-10-28T00:05:00+01:00" },
    );
    expect([moved.start, moved.end, moved.recurrence!.weekdays]).toEqual([
      "2026-10-19T23:50:00+02:00",
      "2026-10-20T00:05:00+02:00",
      [1, 2, 3, 4, 5],
    ]);
  });

  it("N11: the length is in absolute minutes across DST (25 h)", () => {
    const moved = bySeries(
      series({
        start: "2026-10-24T09:00:00+02:00",
        end: "2026-10-24T10:00:00+02:00",
        recurrence: { frequency: "weekly", weekdays: [6], timeZone: BXL },
      }),
      "2026-10-31",
      { end: "2026-11-01T10:00:00+01:00" },
    );
    expect([moved.start, moved.end]).toEqual([
      "2026-10-24T09:00:00+02:00",
      "2026-10-25T09:00:00+01:00",
    ]);
  });

  it("a 1 h series moved over the clock change stays at 09:00 and lasts 1 h", () => {
    const moved = bySeries(
      series({
        start: "2026-10-19T09:00:00+02:00",
        end: "2026-10-19T10:00:00+02:00",
        recurrence: { frequency: "weekly", timeZone: BXL },
      }),
      "2026-10-19",
      { start: "2026-10-26T09:00:00+01:00", end: "2026-10-26T10:00:00+01:00" },
    );
    expect([moved.start, moved.end]).toEqual([
      "2026-10-26T09:00:00+01:00",
      "2026-10-26T10:00:00+01:00",
    ]);
  });

  it("N26: a series without an end keeps none; end: null clears it", () => {
    const monday = {
      frequency: "weekly" as const,
      weekdays: [1],
      timeZone: BXL,
    };
    const kept = bySeries(
      series({ start: "2026-10-19T09:00:00+02:00", recurrence: monday }),
      "2026-10-26",
      { start: "2026-10-26T10:00:00+01:00" },
    );
    expect([kept.start, "end" in kept]).toEqual([
      "2026-10-19T10:00:00+02:00",
      false,
    ]);
    const cleared = bySeries(
      series({
        start: "2026-10-19T09:00:00+02:00",
        end: "2026-10-19T10:00:00+02:00",
        recurrence: monday,
      }),
      "2026-10-26",
      { end: null },
    );
    expect("end" in cleared).toBe(false);
  });

  it("N37: moved by days, its weekday, exceptions and until follow", () => {
    const moved = bySeries(
      series({
        start: "2026-10-19T09:00:00+02:00",
        end: "2026-10-19T10:00:00+02:00",
        recurrence: {
          frequency: "weekly",
          weekdays: [1],
          exceptions: ["2026-11-02"],
          until: "2026-12-28",
          timeZone: BXL,
        },
      }),
      "2026-10-26",
      { start: "2026-10-27T09:00:00+01:00", end: "2026-10-27T10:00:00+01:00" },
    );
    expect([
      moved.start,
      moved.recurrence!.weekdays,
      moved.recurrence!.exceptions,
      moved.recurrence!.until,
    ]).toEqual([
      "2026-10-20T09:00:00+02:00",
      [2],
      ["2026-11-03"],
      "2026-12-29",
    ]);
  });

  it("N38: switched to all-day, the occurrence's days become the bounds", () => {
    const monday = series({
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T10:00:00+02:00",
      recurrence: { frequency: "weekly", weekdays: [1], timeZone: BXL },
    });
    const withDays = bySeries(monday, "2026-10-26", {
      allDay: true,
      start: "2026-10-26",
      end: "2026-10-27",
    });
    expect([withDays.allDay, withDays.start, withDays.end]).toEqual([
      true,
      "2026-10-19",
      "2026-10-20",
    ]);
    const bare = bySeries(monday, "2026-10-26", { allDay: true });
    expect([bare.allDay, bare.start, bare.end]).toEqual([
      true,
      "2026-10-19",
      "2026-10-19",
    ]);
  });

  it("N27: a New York series keeps 09:00 New York past its own clock change", () => {
    const moved = bySeries(
      series({
        start: "2026-10-19T09:00:00-04:00",
        end: "2026-10-19T09:30:00-04:00",
        recurrence: {
          frequency: "weekly",
          weekdays: [1],
          timeZone: "America/New_York",
        },
      }),
      "2026-11-02",
      { start: "2026-11-03T09:00:00-05:00", end: "2026-11-03T09:30:00-05:00" },
    );
    expect([moved.start, moved.end, moved.recurrence!.weekdays]).toEqual([
      "2026-10-20T09:00:00-04:00",
      "2026-10-20T09:30:00-04:00",
      [2],
    ]);
  });
});

describe("N9 two series changes made through different occurrences", () => {
  it("move the series by both, through the first", () => {
    const monday = series({
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T10:00:00+02:00",
      recurrence: { frequency: "weekly", weekdays: [1], timeZone: BXL },
    });
    const first: AgendaChange = {
      kind: "move",
      id: "s",
      occurrence: "2026-10-26",
      scope: "series",
      patch: {
        start: "2026-10-27T09:00:00+01:00",
        end: "2026-10-27T10:00:00+01:00",
      },
      previous: {
        start: "2026-10-26T09:00:00+01:00",
        end: "2026-10-26T10:00:00+01:00",
      },
    };
    // Drawn on Tuesdays now, its 3/11 occurrence moves two more days.
    const second: AgendaChange = {
      kind: "move",
      id: "s",
      occurrence: "2026-11-03",
      scope: "series",
      patch: {
        start: "2026-11-05T09:00:00+01:00",
        end: "2026-11-05T10:00:00+01:00",
      },
      previous: {
        start: "2026-11-03T09:00:00+01:00",
        end: "2026-11-03T10:00:00+01:00",
      },
    };
    const merged = mergeChanges(first, second, BXL)!;
    expect(merged.occurrence).toBe("2026-10-26");
    const [moved] = applyChange([monday], merged, undefined, BXL);
    expect([moved!.start, moved!.end, moved!.recurrence!.weekdays]).toEqual([
      "2026-10-22T09:00:00+02:00",
      "2026-10-22T10:00:00+02:00",
      [4],
    ]);
  });
});

interface Pending {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse) => void;
}

function harness(mode: "immediate" | "staged" = "immediate", confirmed = true) {
  const pending: Pending[] = [];
  const failed: AgendaEdit[] = [];
  const declined = vi.fn();
  const engine = createAgendaSaveEngine({
    mode: () => mode,
    send: (request) =>
      new Promise((resolve) => pending.push({ request, resolve })),
    context: () => ({ conflicts: "detect", from: "a", to: "b", view: "week" }),
    confirm: async () => confirmed,
    onAnswer: () => undefined,
    onFailed: (edits) => failed.push(...edits),
    onDeclined: declined,
    describeError: () => "failed",
    text: (message) => String(message),
    unaddressed: () => "Reload and make it again",
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()!.resolve(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { engine, pending, failed, declined, answer };
}

const moveA: AgendaChange = {
  kind: "move",
  id: "a",
  patch: { start: "2026-10-21T22:00:00+02:00" },
  previous: { start: "2026-10-21T09:00:00+02:00" },
};
const renameA: AgendaChange = {
  kind: "update",
  id: "a",
  patch: { title: "R" },
  previous: { title: "A" },
};

describe("the save queue's corners", () => {
  it("N2: a change made during a refused write is posted alone", async () => {
    const { engine, pending, answer } = harness();
    void engine.record(moveA);
    void engine.record(renameA);
    await answer({ errors: [{ index: 0, message: "Too late" }] });
    expect(pending.map((entry) => entry.request.changes)).toEqual([[renameA]]);
  });

  it("N20: a confirm declined keeps the change made meanwhile (sent alone, or staged with the rest)", async () => {
    const immediate = harness("immediate", false);
    void immediate.engine.record(moveA);
    void immediate.engine.record(renameA);
    await immediate.answer({ confirm: { title: "Sure?" } });
    expect(immediate.declined).toHaveBeenCalled();
    expect(immediate.pending.map((entry) => entry.request.changes)).toEqual([
      [renameA],
    ]);

    const staged = harness("staged", false);
    void staged.engine.record(moveA);
    void staged.engine.saveAll();
    void staged.engine.record(renameA);
    expect(staged.engine.hasUnsaved.value).toBe(true);
    await staged.answer({ confirm: { title: "Sure?" } });
    expect(staged.engine.edits.value[0]!.change.patch).toMatchObject({
      start: "2026-10-21T22:00:00+02:00",
      title: "R",
    });
  });

  it("N20: an event gone takes the change queued behind it along", async () => {
    const { engine, pending, answer } = harness();
    void engine.record(moveA);
    void engine.record(renameA);
    await answer({ errors: [{ index: 0, message: "Gone", code: "notFound" }] });
    expect(pending).toHaveLength(0);
    expect(engine.count.value).toBe(0);
  });

  it("N20: a delete queued behind a create answered with no id is told, not posted", async () => {
    const { engine, pending, failed, answer } = harness();
    void engine.record({
      kind: "create",
      tempId: "tmp-1",
      patch: { title: "N" },
    });
    void engine.record({ kind: "delete", id: "tmp-1" });
    await answer({});
    expect(pending).toHaveLength(0);
    expect(failed[0]).toMatchObject({
      change: { kind: "delete", id: "tmp-1" },
      message: "Reload and make it again",
    });
  });

  it("N20: a change of an event whose Undo is running waits for it", async () => {
    const { engine, pending, answer } = harness();
    void engine.writeNow([moveA]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    void engine.record(renameA);
    expect(pending).toHaveLength(1);
    await answer({});
    expect(pending.map((entry) => entry.request.changes)).toEqual([[renameA]]);
  });

  it("N25: Overwrite after a confirmed write keeps force", async () => {
    const { engine, pending, answer } = harness();
    void engine.record(moveA);
    await answer({ confirm: { title: "Sure?" } });
    await answer({
      errors: [
        {
          index: 0,
          message: "Moved",
          code: "conflict",
          current: series({ id: "a" }),
        },
      ],
    });
    void engine.overwrite("a");
    expect(pending[0]!.request).toMatchObject({ overwrite: true, force: true });
  });
});

describe("N16 an Undo's previous", () => {
  it("is null for an end the event did not hold, whatever the caller left undefined", () => {
    const change = completeChange({
      change: {
        kind: "move",
        id: "a",
        patch: {
          start: "2026-10-21T14:00:00+02:00",
          end: "2026-10-21T15:00:00+02:00",
        },
        previous: { start: "2026-10-21T09:00:00+02:00", end: undefined },
      },
      event: { id: "a", title: "A", start: "2026-10-21T09:00:00+02:00" },
      timeZone: BXL,
    });
    expect(change.previous).toEqual({
      start: "2026-10-21T09:00:00+02:00",
      end: null,
    });
  });
});

describe("N13 the arrows step through the chips drawn", () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    document.body.innerHTML = "";
  });

  it("skips an event drawn behind a +N more", () => {
    document.body.innerHTML = `
      <div data-dms-agenda>
        <button data-agenda-occurrence="a">A</button>
        <button data-agenda-occurrence="c">C</button>
      </div>`;
    const root = document.querySelector<HTMLElement>("[data-dms-agenda]")!;
    const focusedKey = ref<string | null>(null);
    const scope = effectScope();
    scope.run(() =>
      useAgendaShortcuts({
        root: ref(root),
        enabled: () => true,
        isStaged: () => false,
        views: () => [],
        occurrences: () =>
          ["a", "b", "c"].map((key) => ({ key }) as AgendaOccurrence),
        focusedKey,
        goToday: vi.fn(),
        go: vi.fn(),
        setView: vi.fn(),
        createNew: vi.fn(),
        open: vi.fn(),
        remove: vi.fn(),
        saveStaged: vi.fn(),
        hasStaged: () => false,
        cancel: vi.fn(),
      }),
    );
    stop = () => scope.stop();
    const chipA = root.querySelector<HTMLElement>(
      '[data-agenda-occurrence="a"]',
    )!;
    chipA.focus();
    chipA.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(document.activeElement?.getAttribute("data-agenda-occurrence")).toBe(
      "c",
    );
    expect(focusedKey.value).toBe("c");
  });
});

describe("N31 one colour check, the same everywhere", () => {
  it("takes CSS named colours and colour functions, and nothing else", () => {
    expect(agendaColorCss("teal")).toBe("teal");
    expect(agendaColorCss("Teal" as never)).toBe("Teal");
    expect(agendaColorCss("tael" as never)).toBe("var(--ui-primary)");
    expect(agendaColorCss("oklch(0.62 0.15 258)")).toBe("oklch(0.62 0.15 258)");
    expect(agendaColorCss("#12345" as never)).toBe("var(--ui-primary)");
  });
});

describe("L4 a period picked past minDate / maxDate", () => {
  it("shows the roster's last 30 days as its published weeks 40 to 42", () => {
    expect(
      clampDays(
        { from: "2026-09-26", to: "2026-10-26" },
        { min: "2026-09-28", max: "2026-10-18" },
      ),
    ).toEqual({ from: "2026-09-28", to: "2026-10-18" });
    expect(
      clampDays(
        { from: "2026-11-01", to: "2026-11-30" },
        { max: "2026-10-18" },
      ),
    ).toEqual({ from: "2026-10-18", to: "2026-10-18" });
  });
});

describe("N8 a read older than a write", () => {
  it("shows the write laid over it", () => {
    const read = {
      events: [{ id: "a", title: "A", start: "2026-10-21T09:00:00+02:00" }],
    };
    const layers = [
      {
        seq: 1,
        response: {},
        written: [{ ...moveA, patch: { start: "2026-10-21T10:00:00+02:00" } }],
        seeds: new Map(),
      },
    ];
    expect(layerAnswers(read, layers, 0, BXL).events[0]!.start).toBe(
      "2026-10-21T10:00:00+02:00",
    );
    expect(layerAnswers(read, layers, 1, BXL).events[0]!.start).toBe(
      "2026-10-21T09:00:00+02:00",
    );
  });
});

describe("N23 the save status", () => {
  afterEach(() => vi.useRealTimers());

  function fakeEngine() {
    const state = reactive({
      saving: false,
      writing: false,
      edits: [] as AgendaEdit[],
    });
    const engine = {
      isSaving: computed(() => state.saving),
      isWritingNow: computed(() => state.writing),
      edits: computed(() => state.edits),
    } as unknown as AgendaSaveEngine;
    return { state, engine };
  }

  it("tells saving, an error while one waits, a refusal for a moment, and clears a declined confirm", () => {
    vi.useFakeTimers();
    const { state, engine } = fakeEngine();
    const scope = effectScope();
    const status = scope.run(() => useAgendaSaveStatus(() => engine))!;
    state.writing = true;
    expect(status.status.value).toBe("saving");
    state.writing = false;
    status.settle("error");
    expect(status.status.value).toBe("error");
    vi.advanceTimersByTime(7000);
    expect(status.status.value).toBe("idle");
    state.edits = [{ key: "a", change: moveA, status: "conflict" }];
    expect(status.status.value).toBe("error");
    state.edits = [];
    status.settle("saved");
    status.clear();
    expect(status.status.value).toBe("idle");
    scope.stop();
  });
});
