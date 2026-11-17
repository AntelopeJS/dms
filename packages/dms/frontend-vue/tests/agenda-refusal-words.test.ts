import { unawaited } from "./fixtures/agendaRuntime";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { describe, expect, it } from "vitest";
import {
  isPastDay,
  seriesChangeDay,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaApply";
import type { AgendaEdit } from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/entries/composables/agenda/agendaSaveEngine";
import type {
  AgendaEvent,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  const pending: {
    request: AgendaSaveRequest;
    resolve: (response: AgendaSaveResponse) => void;
  }[] = [];
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
    text: (message) => (isString(message) ? message : ""),
    timeZone: () => "Europe/Brussels",
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()?.resolve(response);
    await tick();
    await tick();
  };
  return { engine, failed, answer };
}

const series: AgendaEvent = {
  id: "s1",
  title: "Hours",
  start: "2026-11-02T08:30:00.000Z",
  end: "2026-11-02T11:30:00.000Z",
  changeableFrom: "2026-11-14",
  recurrence: { frequency: "weekly", interval: 1, weekdays: [1] },
};

describe("the words of a refusal and of the recurring prompt", () => {
  it("offers no Retry on a refusal the route says cannot succeed again, and keeps it on one it does not (fails when a member is invited to retry what will be refused again)", async () => {
    const { engine, failed, answer } = harness();
    unawaited(
      engine.record({ kind: "update", id: "a", patch: { title: "x" } }),
    );
    await answer({
      errors: [{ index: 0, message: "No", code: "refused", retryable: false }],
    });
    unawaited(
      engine.record({ kind: "update", id: "b", patch: { title: "y" } }),
    );
    await answer({ errors: [{ index: 0, message: "Busy" }] });
    expect(failed.map((edit) => edit.retryable)).toEqual([false, undefined]);
  });

  it("tells a past occurrence from one a series change still reaches, and says when the series has no day left (fails when the prompt promises a day after the series ended, or calls a past day a change from it on)", () => {
    expect([
      isPastDay(series, "2026-11-09"),
      isPastDay(series, "2026-11-16"),
      isPastDay({ ...series, changeableFrom: null }, "2026-11-09"),
      seriesChangeDay({ ...series, changeableFrom: null }, "2026-11-09"),
    ]).toEqual([true, false, false, null]);
  });
});
