/** @vitest-environment jsdom */
/**
 * The FullAgenda save queue: changes queued behind a create or a detach, refusals and
 * conflicts never stuck, no Undo without an id and what a Save
 * sends.
 */

import { isString } from "../layers/dms-core/app/utils/type-check";
import { unawaited } from "./fixtures/agendaRuntime";
import { describe, expect, it } from "vitest";
import { inverseChange } from "../layers/dms-ui/app/entries/composables/agenda/agendaChanges";
import { createAgendaSaveEngine } from "../layers/dms-ui/app/entries/composables/agenda/agendaSaveEngine";
import type {
  AgendaChange,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

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
    text: (message) => (isString(message) ? message : ""),
  });
  const answer = async (response: AgendaSaveResponse) => {
    pending.shift()!.resolve(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { engine, pending, answer };
}

describe("a change queued behind a create or a detach", () => {
  it("goes to the id the route gave the new event", async () => {
    const { engine, pending, answer } = engineHarness();
    unawaited(
      engine.record({
        kind: "create",
        tempId: "tmp-1",
        patch: { title: "New" },
      }),
    );
    unawaited(
      engine.record({
        kind: "move",
        id: "tmp-1",
        patch: { start: "2026-10-21T10:00:00+02:00" },
        previous: { start: "2026-10-21T09:00:00+02:00" },
      }),
    );
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
    unawaited(
      engine.record({
        kind: "create",
        tempId: "tmp-2",
        patch: { title: "New" },
      }),
    );
    unawaited(engine.record({ kind: "delete", id: "tmp-2" }));
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
    unawaited(engine.record(detach));
    unawaited(engine.record(rename));
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
    unawaited(engine.record(detach));
    unawaited(engine.record(rename));
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

describe("Undo and what a Save sends", () => {
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
    unawaited(
      engine.record({
        kind: "update",
        id: "a",
        patch: { title: "A2" },
        previous: { title: "A" },
      }),
    );
    unawaited(
      engine.record({
        kind: "update",
        id: "b",
        patch: { title: "B2" },
        previous: { title: "B" },
      }),
    );
    const edit = engine.editOf("b")!;
    edit.status = "conflict";
    expect(engine.sendable.value.map((entry) => entry.key)).toEqual(["a"]);
  });
});
