/**
 * Refusals in the FullAgenda engine: a staged
 * series change without a start still carries later moves, a change
 * made to a refused new event stays with it, merges after a refusal
 * use the series' zone, a change sent after a refusal reads what the
 * route stores, save answers' lists stay with their range, no
 * Retry for what cannot be retried, and an Undo waits for every write
 * of its event.
 */
import { isString } from "../layers/dms-core/app/utils/type-check";
import { unawaited } from "./fixtures/agendaRuntime";
import { describe, expect, it, vi } from "vitest";
import {
  applyChange,
  mergeChanges,
  type AgendaEdit,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
import { completeChange } from "../layers/dms-ui/app/entries/composables/agenda/agendaApply";
import { buildOccurrences } from "../layers/dms-ui/app/entries/composables/agenda/agendaOccurrences";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/entries/composables/agenda/agendaSaveEngine";
import { layerAnswers } from "../layers/dms-ui/app/entries/composables/agenda/agendaData";
import { AgendaInFlight } from "../layers/dms-ui/app/entries/composables/agenda/agendaInFlight";
import {
  addDays,
  dayStartEpoch,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaTime";
import type {
  AgendaChange,
  AgendaEvent,
  AgendaEventPatch,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

const BXL = "Europe/Brussels";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const monday: AgendaEvent = {
  id: "s",
  title: "Review",
  start: "2026-10-19T09:00:00+02:00",
  end: "2026-10-19T10:00:00+02:00",
  recurrence: { frequency: "weekly", weekdays: [1], timeZone: BXL },
};

function occurrenceOn(event: AgendaEvent, day: string) {
  return buildOccurrences([event], {
    timeZone: BXL,
    from: day,
    to: day,
    start: dayStartEpoch(day, BXL),
    end: dayStartEpoch(addDays(day, 1), BXL),
    defaultDurationMinutes: 60,
    editable: true,
    dragMove: true,
    dragResize: true,
    detailsContainer: "drawer",
    calendars: new Map(),
    resources: new Map(),
  })[0]!;
}

/** A change of the series made through one of its occurrences, completed as `apply` does. */
const throughOccurrence = (day: string, patch: AgendaEventPatch) =>
  completeChange({
    change: { kind: "update", id: "s", occurrence: day, patch },
    occurrence: occurrenceOn(monday, day),
    scope: "series",
    timeZone: BXL,
  });

describe("a staged series change without a start keeps a later move", () => {
  const move = throughOccurrence("2026-11-02", {
    start: "2026-11-03T09:00:00+01:00",
    end: "2026-11-03T10:00:00+01:00",
  });

  it("names the occurrence's own times in previous, whatever it changes", () => {
    expect(
      throughOccurrence("2026-10-26", { title: "T" }).previous,
    ).toMatchObject({
      start: "2026-10-26T09:00:00+01:00",
      end: "2026-10-26T10:00:00+01:00",
    });
  });

  it("a retitle, then a move: the series moves to Tuesday, retitled", () => {
    const merged = mergeChanges(
      throughOccurrence("2026-10-26", { title: "T" }),
      move,
      BXL,
    )!;
    const [moved] = applyChange([monday], merged, undefined, BXL);
    expect(moved).toMatchObject({
      title: "T",
      start: "2026-10-20T09:00:00+02:00",
      end: "2026-10-20T10:00:00+02:00",
      recurrence: { weekdays: [2] },
    });
  });

  it("an end-only edit, then a move: two hours long, on Tuesday", () => {
    const merged = mergeChanges(
      throughOccurrence("2026-10-26", { end: "2026-10-26T11:00:00+01:00" }),
      throughOccurrence("2026-11-02", {
        start: "2026-11-03T09:00:00+01:00",
        end: "2026-11-03T11:00:00+01:00",
      }),
      BXL,
    )!;
    const [moved] = applyChange([monday], merged, undefined, BXL);
    expect([moved!.start, moved!.end]).toEqual([
      "2026-10-20T09:00:00+02:00",
      "2026-10-20T11:00:00+02:00",
    ]);
  });
});

interface Pending {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse) => void;
}

function harness(mode: "immediate" | "staged", confirmed = true) {
  const pending: Pending[] = [];
  const failed: AgendaEdit[] = [];
  const engine = createAgendaSaveEngine({
    mode: () => mode,
    send: (request) =>
      new Promise((resolve) => pending.push({ request, resolve })),
    context: () => ({ conflicts: "detect", from: "a", to: "b", view: "week" }),
    confirm: async () => confirmed,
    onAnswer: () => undefined,
    onFailed: (edits) => failed.push(...edits),
    describeError: () => "failed",
    text: (message) => (isString(message) ? message : ""),
    timeZone: () => "UTC",
    unaddressed: () => "Reload",
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()!.resolve(response);
    await tick();
  };
  return { engine, pending, failed, answer };
}

const create: AgendaChange = {
  kind: "create",
  tempId: "tmp-1",
  patch: {
    title: "New",
    start: "2026-10-21T09:00:00+02:00",
    end: "2026-10-21T10:00:00+02:00",
  },
};
const resize: AgendaChange = {
  kind: "resize",
  id: "tmp-1",
  patch: { end: "2026-10-21T11:00:00+02:00" },
  previous: { end: "2026-10-21T10:00:00+02:00" },
};

describe("a change made to a new event the route refused", () => {
  it("stays in the Retry copy, never posted to the temporary id", async () => {
    const { engine, pending, failed, answer } = harness("immediate");
    unawaited(engine.record(create));
    unawaited(engine.record(resize));
    await answer({ errors: [{ index: 0, message: "No" }] });
    await tick();
    expect(pending).toHaveLength(0);
    expect(failed[0]!.change).toMatchObject({
      kind: "create",
      tempId: "tmp-1",
      patch: { end: "2026-10-21T11:00:00+02:00" },
    });
  });

  it("is dropped with the new event the user declined", async () => {
    const { engine, pending, answer } = harness("immediate", false);
    unawaited(engine.record(create));
    unawaited(engine.record(resize));
    await answer({ confirm: { title: "Sure?" } });
    await tick();
    expect(pending).toHaveLength(0);
    expect(engine.count.value).toBe(0);
  });
});

describe("a merge after a refusal uses the series' zone", () => {
  it("moves a Saturday series a week across DST at 10:00, not 11:00", async () => {
    const saturday: AgendaEvent = {
      id: "sat",
      title: "Sat",
      start: "2026-10-24T10:00:00+02:00",
      end: "2026-10-24T11:00:00+02:00",
      recurrence: { frequency: "weekly", weekdays: [6], timeZone: BXL },
    };
    const { engine, answer } = harness("staged");
    unawaited(
      engine.record(
        {
          kind: "update",
          id: "sat",
          occurrence: "2026-10-31",
          scope: "series",
          patch: { title: "T" },
          previous: {
            start: "2026-10-31T10:00:00+01:00",
            end: "2026-10-31T11:00:00+01:00",
          },
        },
        { base: saturday },
      ),
    );
    unawaited(engine.saveAll());
    unawaited(
      engine.record({
        kind: "move",
        id: "sat",
        occurrence: "2026-10-24",
        scope: "series",
        patch: {
          start: "2026-10-31T10:00:00+01:00",
          end: "2026-10-31T11:00:00+01:00",
        },
        previous: {
          start: "2026-10-24T10:00:00+02:00",
          end: "2026-10-24T11:00:00+02:00",
        },
      }),
    );
    await answer({ errors: [{ index: 0, message: "No" }] });
    expect(engine.edits.value[0]!.change.patch).toMatchObject({
      title: "T",
      start: "2026-11-07T10:00:00+01:00",
    });
  });
});

describe("a change sent after a refused one", () => {
  it("reads the stored value, not the refused place, for the fields both set", async () => {
    const { engine, pending, answer } = harness("immediate");
    unawaited(
      engine.record({
        kind: "move",
        id: "a",
        patch: { start: "2026-10-21T22:00:00+02:00" },
        previous: { start: "2026-10-21T09:00:00+02:00" },
      }),
    );
    unawaited(
      engine.record({
        kind: "move",
        id: "a",
        patch: { start: "2026-10-21T20:00:00+02:00" },
        previous: { start: "2026-10-21T22:00:00+02:00" },
      }),
    );
    await answer({ errors: [{ index: 0, message: "Too late" }] });
    await tick();
    expect(pending[0]!.request.changes[0]!.previous).toEqual({
      start: "2026-10-21T09:00:00+02:00",
    });
  });
});

describe("a save answer's lists belong to its range", () => {
  it("lays the notices only over a read of the range it was answered for", () => {
    const read = { events: [], notices: [{ message: "W2" }] };
    const layers = [
      {
        seq: 1,
        response: { notices: [{ message: "W1" }] },
        written: [],
        seeds: new Map(),
        range: { from: "2026-10-19", to: "2026-10-25", view: "week" },
      },
    ];
    expect(
      layerAnswers(read, layers, 0, BXL, {
        from: "2026-10-26",
        to: "2026-11-01",
        view: "week",
      }).notices,
    ).toEqual([{ message: "W2" }]);
    expect(
      layerAnswers(read, layers, 0, BXL, {
        from: "2026-10-19",
        to: "2026-10-25",
        view: "week",
      }).notices,
    ).toEqual([{ message: "W1" }]);
  });
});

describe("no Retry for a change the route cannot address", () => {
  it("marks a delete queued behind a create answered with no id as not retryable", async () => {
    const { engine, failed, answer } = harness("immediate");
    unawaited(engine.record(create));
    unawaited(engine.record({ kind: "delete", id: "tmp-1" }));
    await answer({});
    expect(failed[0]).toMatchObject({ retryable: false, message: "Reload" });
  });
});

describe("waiting for every write of an event", () => {
  it("settles only once the write started after the first one settles too", async () => {
    const inFlight = new AgendaInFlight();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = new Promise<void>((resolve) => (finishFirst = resolve));
    const second = new Promise<void>((resolve) => (finishSecond = resolve));
    unawaited(inFlight.track(["a"], first));
    unawaited(first.then(() => inFlight.track(["a"], second)));
    const settled = vi.fn();
    unawaited(inFlight.settled(["a"]).then(settled));
    finishFirst();
    await tick();
    expect(settled).not.toHaveBeenCalled();
    finishSecond();
    await tick();
    expect(settled).toHaveBeenCalled();
  });
});
