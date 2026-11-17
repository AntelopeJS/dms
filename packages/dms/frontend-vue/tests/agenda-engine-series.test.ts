/** @vitest-environment jsdom */
/**
 * Series in the FullAgenda engine: the
 * series rules shared with the playground's routes, on their own scenarios,
 * two series changes merged, the save
 * queue's corners, an Undo's `previous`, the keyboard
 * in drawn order, one colour check, a period clamped to
 * `minDate` / `maxDate`, save answers laid over an older read,
 * and the save status.
 */
import { isString } from "../layers/dms-core/app/utils/type-check";
import { unawaited } from "./fixtures/agendaRuntime";
import { describe, expect, it, vi } from "vitest";
import {
  applyChange,
  mergeChanges,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/entries/composables/agenda/agendaSaveEngine";
import { layerAnswers } from "../layers/dms-ui/app/entries/composables/agenda/agendaData";
import type { AgendaEdit } from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
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

describe("series moves shared with the routes", () => {
  it("a multi-weekday series moved across midnight ends after it starts", () => {
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
  it("the length is in absolute minutes across DST (25 h)", () => {
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
  it("a series without an end keeps none; end: null clears it", () => {
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
});

describe("series bounds and zones shared with the routes", () => {
  it("moved by days, its weekday, exceptions and until follow", () => {
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
  it("switched to all-day, the occurrence's days become the bounds", () => {
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
  it("a New York series keeps 09:00 New York past its own clock change", () => {
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

describe("two series changes made through different occurrences", () => {
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
    text: (message) => (isString(message) ? message : ""),
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
  it("a change made during a refused write is posted alone", async () => {
    const { engine, pending, answer } = harness();
    unawaited(engine.record(moveA));
    unawaited(engine.record(renameA));
    await answer({ errors: [{ index: 0, message: "Too late" }] });
    expect(pending.map((entry) => entry.request.changes)).toEqual([[renameA]]);
  });

  it("a confirm declined keeps the change made meanwhile (sent alone, or staged with the rest)", async () => {
    const immediate = harness("immediate", false);
    unawaited(immediate.engine.record(moveA));
    unawaited(immediate.engine.record(renameA));
    await immediate.answer({ confirm: { title: "Sure?" } });
    expect(immediate.declined).toHaveBeenCalled();
    expect(immediate.pending.map((entry) => entry.request.changes)).toEqual([
      [renameA],
    ]);

    const staged = harness("staged", false);
    unawaited(staged.engine.record(moveA));
    unawaited(staged.engine.saveAll());
    unawaited(staged.engine.record(renameA));
    expect(staged.engine.hasUnsaved.value).toBe(true);
    await staged.answer({ confirm: { title: "Sure?" } });
    expect(staged.engine.edits.value[0]!.change.patch).toMatchObject({
      start: "2026-10-21T22:00:00+02:00",
      title: "R",
    });
  });

  it("an event gone takes the change queued behind it along", async () => {
    const { engine, pending, answer } = harness();
    unawaited(engine.record(moveA));
    unawaited(engine.record(renameA));
    await answer({ errors: [{ index: 0, message: "Gone", code: "notFound" }] });
    expect(pending).toHaveLength(0);
    expect(engine.count.value).toBe(0);
  });

  it("a delete queued behind a create answered with no id is told, not posted", async () => {
    const { engine, pending, failed, answer } = harness();
    unawaited(
      engine.record({
        kind: "create",
        tempId: "tmp-1",
        patch: { title: "N" },
      }),
    );
    unawaited(engine.record({ kind: "delete", id: "tmp-1" }));
    await answer({});
    expect(pending).toHaveLength(0);
    expect(failed[0]).toMatchObject({
      change: { kind: "delete", id: "tmp-1" },
      message: "Reload and make it again",
    });
  });

  it("a change of an event whose Undo is running waits for it", async () => {
    const { engine, pending, answer } = harness();
    unawaited(engine.writeNow([moveA]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    unawaited(engine.record(renameA));
    expect(pending).toHaveLength(1);
    await answer({});
    expect(pending.map((entry) => entry.request.changes)).toEqual([[renameA]]);
  });

  it("Overwrite after a confirmed write keeps force", async () => {
    const { engine, pending, answer } = harness();
    unawaited(engine.record(moveA));
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
    unawaited(engine.overwrite("a"));
    expect(pending[0]!.request).toMatchObject({ overwrite: true, force: true });
  });
});

describe("a read older than a write", () => {
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
