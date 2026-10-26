/**
 * Round 4 follow-ups of the FullAgenda save engine (critic items in
 * brackets), through the engine itself: an Undo waits for the change queued
 * behind the write it waits for (m5), a series move queued behind a refused
 * series change keeps its own occurrence (R3), and a refused new event the
 * user deleted meanwhile offers no Retry (R4).
 */
import { describe, expect, it } from "vitest";
import {
  applyChange,
  type AgendaEdit,
} from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import type {
  AgendaChange,
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

const BXL = "Europe/Brussels";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Pending {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse) => void;
}

function harness() {
  const pending: Pending[] = [];
  const failed: AgendaEdit[] = [];
  const engine = createAgendaSaveEngine({
    mode: () => "immediate",
    send: (request) =>
      new Promise((resolve) => pending.push({ request, resolve })),
    context: () => ({ conflicts: "detect", from: "a", to: "b", view: "week" }),
    confirm: async () => true,
    onAnswer: () => undefined,
    onFailed: (edits) => failed.push(...edits),
    describeError: () => "failed",
    text: (message) => String(message),
    timeZone: () => BXL,
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()!.resolve(response);
    await tick();
    await tick();
  };
  return { engine, pending, failed, answer };
}

describe("m5 an Undo clicked while a write of the event runs, a change queued behind it", () => {
  it("goes out after the queued change, never with it", async () => {
    const { engine, pending, answer } = harness();
    const move: AgendaChange = {
      kind: "move",
      id: "a",
      patch: { start: "2026-10-21T10:00:00+02:00" },
      previous: { start: "2026-10-21T09:00:00+02:00" },
    };
    const rename: AgendaChange = {
      kind: "update",
      id: "a",
      patch: { title: "R" },
      previous: { title: "A" },
    };
    const undo: AgendaChange = {
      kind: "move",
      id: "a",
      patch: { start: "2026-10-21T09:00:00+02:00" },
      previous: { start: "2026-10-21T10:00:00+02:00" },
    };
    void engine.record(move);
    void engine.record(rename);
    void engine.writeNow([undo]);
    await tick();
    expect(pending).toHaveLength(1);
    await answer({});
    expect(pending.map((entry) => entry.request.changes)).toEqual([[rename]]);
    await answer({});
    expect(pending.map((entry) => entry.request.changes)).toEqual([[undo]]);
  });
});

describe("R3 a series move queued behind a refused series change", () => {
  it("keeps its own occurrence's times: the series moves one day, its exception with it", async () => {
    const monday: AgendaEvent = {
      id: "s",
      title: "Review",
      start: "2026-10-19T09:00:00+02:00",
      end: "2026-10-19T10:00:00+02:00",
      recurrence: {
        frequency: "weekly",
        weekdays: [1],
        exceptions: ["2026-11-16"],
        timeZone: BXL,
      },
    };
    const { engine, pending, answer } = harness();
    void engine.record(
      {
        kind: "update",
        id: "s",
        occurrence: "2026-10-26",
        scope: "series",
        patch: { title: "T" },
        previous: {
          start: "2026-10-26T09:00:00+01:00",
          end: "2026-10-26T10:00:00+01:00",
        },
      },
      { base: monday },
    );
    void engine.record({
      kind: "move",
      id: "s",
      occurrence: "2026-11-02",
      scope: "series",
      patch: {
        start: "2026-11-03T09:00:00+01:00",
        end: "2026-11-03T10:00:00+01:00",
      },
      previous: {
        start: "2026-11-02T09:00:00+01:00",
        end: "2026-11-02T10:00:00+01:00",
      },
    });
    await answer({ errors: [{ index: 0, message: "No" }] });
    const sent = pending[0]!.request.changes[0]!;
    expect(sent.previous?.start).toBe("2026-11-02T09:00:00+01:00");
    const [moved] = applyChange([monday], sent, undefined, BXL);
    expect([moved!.start, moved!.recurrence!.exceptions]).toEqual([
      "2026-10-20T09:00:00+02:00",
      ["2026-11-17"],
    ]);
  });
});

describe("R4 a refused new event deleted meanwhile", () => {
  it("is told without a Retry, and nothing is posted", async () => {
    const { engine, pending, failed, answer } = harness();
    void engine.record({
      kind: "create",
      tempId: "tmp-1",
      patch: { title: "New" },
    });
    void engine.record({ kind: "delete", id: "tmp-1" });
    await answer({ errors: [{ index: 0, message: "No" }] });
    expect(pending).toHaveLength(0);
    expect(failed[0]).toMatchObject({ retryable: false });
    expect(engine.count.value).toBe(0);
  });
});
