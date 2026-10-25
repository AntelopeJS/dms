/**
 * The FullAgenda save engine: immediate writes (Saving, refused and put
 * back, Retry), one write at a time per event, staged changes merged per
 * event and dropped when put back, `confirm` answered with `force`,
 * conflicts (Overwrite / Discard), events gone, Undo, `tempId`s replaced by
 * the answered events, and the answered lists replacing the block's.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createAgendaSaveEngine,
  type AgendaSaveEngineOptions,
} from "../layers/dms-ui/app/build/composables/agenda/agendaSaveEngine";
import {
  inverseChange,
  mergeChanges,
  overlayEdits,
  overlayPending,
} from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import {
  agendaFetchQuery,
  applySaveAnswer,
  leavesLocalId,
  mergeById,
} from "../layers/dms-ui/app/build/composables/agenda/agendaData";
import type {
  AgendaChange,
  AgendaData,
  AgendaSaveMode,
  AgendaSaveRequest,
  AgendaSaveResponse,
} from "../layers/dms-ui/app/types/full-agenda";

interface Pending {
  request: AgendaSaveRequest;
  resolve: (response: AgendaSaveResponse | Error) => void;
}

/** An engine whose requests wait until the test answers them. */
function harness(
  mode: AgendaSaveMode,
  overrides: Partial<AgendaSaveEngineOptions> = {},
) {
  const pending: Pending[] = [];
  const answers: Array<{
    response: AgendaSaveResponse;
    written: AgendaChange[];
  }> = [];
  const saved: AgendaChange[][] = [];
  const failed: string[][] = [];
  const confirm = vi.fn(async () => true);
  const engine = createAgendaSaveEngine({
    mode: () => mode,
    send: (request) =>
      new Promise((resolve, reject) =>
        pending.push({
          request,
          resolve: (response) =>
            response instanceof Error ? reject(response) : resolve(response),
        }),
      ),
    context: () => ({
      conflicts: "detect",
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
    }),
    confirm,
    onAnswer: (response, written) => answers.push({ response, written }),
    onSaved: (written) => saved.push(written),
    onFailed: (edits) => failed.push(edits.map((edit) => edit.key)),
    describeError: (error) => (error as Error).message,
    text: (message) => String(message),
    ...overrides,
  });
  /** Answers the oldest request still waiting, then lets the engine settle. */
  const answer = async (response: AgendaSaveResponse | Error = {}) => {
    const next = pending.shift();
    if (!next) throw new Error("No request is waiting.");
    next.resolve(response);
    await flush();
  };
  return { engine, pending, answers, saved, failed, confirm, answer };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const move = (
  id: string,
  start: string,
  previous = "2026-10-20T09:00:00+02:00",
): AgendaChange => ({
  kind: "move",
  id,
  patch: { start },
  previous: { start: previous },
});

describe("immediate mode", () => {
  it("writes a change at once, drawn at its new place while saving", async () => {
    const { engine, pending, answer, answers, saved } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request).toMatchObject({
      conflicts: "detect",
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
      changes: [{ kind: "move", id: "a" }],
    });
    expect(pending[0]!.request.force).toBeUndefined();
    expect(engine.edits.value[0]!.status).toBe("saving");
    expect(engine.isSaving.value).toBe(true);
    await answer({});
    expect(engine.count.value).toBe(0);
    expect(answers[0]!.written).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });

  it("puts a refused change back where it was, with the route's message, and retries it", async () => {
    const { engine, answer, failed, pending } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [{ index: 0, message: "Room taken", code: "refused" }],
    });
    const [edit] = engine.edits.value;
    expect(edit).toMatchObject({ status: "error", message: "Room taken" });
    expect(failed).toEqual([["a"]]);
    const events = [
      { id: "a", title: "A", start: "2026-10-20T09:00:00+02:00" },
    ];
    expect(
      overlayEdits(events, engine.edits.value, "immediate").events[0]!.start,
    ).toBe("2026-10-20T09:00:00+02:00");
    void engine.retry("a");
    expect(pending).toHaveLength(1);
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("keeps the message of a request that failed as a whole", async () => {
    const { engine, answer } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer(new Error("Network down"));
    expect(engine.edits.value[0]).toMatchObject({
      status: "error",
      message: "Network down",
    });
  });

  it("writes one change of an event at a time, the next once the first settles", async () => {
    const { engine, pending, answer } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    void engine.record({
      kind: "resize",
      id: "a",
      patch: { end: "2026-10-21T11:00:00+02:00" },
      previous: { end: "2026-10-21T10:00:00+02:00" },
    });
    void engine.record(move("b", "2026-10-22T09:00:00+02:00"));
    // Another event goes at once; the second change of `a` waits.
    expect(pending.map((entry) => entry.request.changes[0]!.id)).toEqual([
      "a",
      "b",
    ]);
    const shown = overlayEdits(
      [
        {
          id: "a",
          title: "A",
          start: "2026-10-20T09:00:00+02:00",
          end: "2026-10-20T10:00:00+02:00",
        },
      ],
      engine.edits.value,
      "immediate",
    ).events[0]!;
    expect(shown).toMatchObject({
      start: "2026-10-21T09:00:00+02:00",
      end: "2026-10-21T11:00:00+02:00",
    });
    await answer({});
    expect(pending.map((entry) => entry.request.changes[0]!.kind)).toEqual([
      "move",
      "resize",
    ]);
    await answer({});
    await answer({});
    expect(engine.count.value).toBe(0);
  });
});

describe("staged mode", () => {
  it("keeps the changes, merged per event, until Save writes them together", async () => {
    const { engine, pending, answer } = harness("staged");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    void engine.record(
      move("a", "2026-10-22T09:00:00+02:00", "2026-10-21T09:00:00+02:00"),
    );
    void engine.record(move("b", "2026-10-23T09:00:00+02:00"));
    expect(pending).toHaveLength(0);
    expect(engine.staged.value).toEqual([
      {
        kind: "move",
        id: "a",
        patch: { start: "2026-10-22T09:00:00+02:00" },
        previous: { start: "2026-10-20T09:00:00+02:00" },
      },
      move("b", "2026-10-23T09:00:00+02:00"),
    ]);
    expect(engine.hasUnsaved.value).toBe(true);
    void engine.saveAll();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request.changes).toHaveLength(2);
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("drops a change put back as it was", () => {
    const { engine } = harness("staged");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    void engine.record(
      move("a", "2026-10-20T09:00:00+02:00", "2026-10-21T09:00:00+02:00"),
    );
    expect(engine.count.value).toBe(0);
  });

  it("drops a new event deleted before it was saved, and Discard drops them all", () => {
    const { engine } = harness("staged");
    void engine.record({
      kind: "create",
      tempId: "tmp-1",
      patch: { title: "New" },
    });
    void engine.record({ kind: "delete", id: "tmp-1", tempId: "tmp-1" });
    expect(engine.count.value).toBe(0);
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    engine.discardAll();
    expect(engine.count.value).toBe(0);
  });

  it("draws a staged change at its new place, the old one kept as a ghost", () => {
    const { engine } = harness("staged");
    const ghost = { start: 1, end: 2, allDay: false, resourceIds: [] };
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"), { ghost });
    const { events, marks } = overlayEdits(
      [{ id: "a", title: "A", start: "2026-10-20T09:00:00+02:00" }],
      engine.edits.value,
      "staged",
    );
    expect(events[0]!.start).toBe("2026-10-21T09:00:00+02:00");
    expect(marks.get("a")).toMatchObject({ state: "staged", ghost });
  });
});

describe("confirm", () => {
  it("asks, then posts the same changes again with force", async () => {
    const { engine, pending, answer, confirm } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({ confirm: { title: "Before its predecessor?" } });
    expect(confirm).toHaveBeenCalledWith({ title: "Before its predecessor?" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request).toMatchObject({
      force: true,
      changes: [{ id: "a" }],
    });
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("puts the event back when the user says no, or keeps it staged", async () => {
    const declined = vi.fn(async () => false);
    const immediate = harness("immediate", { confirm: declined });
    void immediate.engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await immediate.answer({ confirm: { title: "Sure?" } });
    expect(immediate.engine.count.value).toBe(0);
    expect(immediate.pending).toHaveLength(0);

    const staged = harness("staged", { confirm: declined });
    void staged.engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    void staged.engine.saveAll();
    await staged.answer({ confirm: { title: "Sure?" } });
    expect(staged.engine.edits.value[0]!.status).toBe("staged");
  });
});

describe("conflicts and events gone", () => {
  const current = { id: "a", title: "A", start: "2026-10-23T09:00:00+02:00" };

  it("holds a conflict until Overwrite writes it with force", async () => {
    const { engine, pending, answer } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [
        { index: 0, message: "Moved meanwhile", code: "conflict", current },
      ],
    });
    expect(engine.edits.value[0]).toMatchObject({
      status: "conflict",
      current,
    });
    // A save of everything leaves a conflict alone.
    void engine.saveAll();
    expect(pending).toHaveLength(0);
    void engine.overwrite("a");
    expect(pending[0]!.request.force).toBe(true);
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("takes the route's version on Discard", async () => {
    const { engine, answer, answers } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [{ index: 0, message: "Moved", code: "conflict", current }],
    });
    engine.discard("a");
    expect(engine.count.value).toBe(0);
    expect(answers.at(-1)!.response.events).toEqual([current]);
  });

  it("removes an event the route no longer has", async () => {
    const onGone = vi.fn();
    const { engine, answer, answers } = harness("immediate", { onGone });
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({ errors: [{ index: 0, message: "Gone", code: "notFound" }] });
    expect(engine.count.value).toBe(0);
    expect(answers[0]!.response.removed).toEqual(["a"]);
    expect(onGone).toHaveBeenCalled();
  });
});

describe("undo", () => {
  it("writes the fields back, after the write of the same event still running", async () => {
    const { engine, pending, answer } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    const inverse = inverseChange(
      move("a", "2026-10-21T09:00:00+02:00"),
      undefined,
      () => "tmp-x",
    )!;
    expect(inverse).toEqual({
      kind: "move",
      id: "a",
      patch: { start: "2026-10-20T09:00:00+02:00" },
      previous: { start: "2026-10-21T09:00:00+02:00" },
    });
    const undone = engine.writeNow([inverse]);
    await flush();
    expect(pending).toHaveLength(1);
    await answer({});
    expect(pending).toHaveLength(1);
    await answer({});
    await expect(undone).resolves.toBe(true);
  });

  it("deletes a created event by the id the route gave it, re-creates a deleted one", () => {
    expect(
      inverseChange(
        { kind: "create", tempId: "tmp-1", patch: { title: "New" } },
        "ev-9",
        () => "tmp-2",
      ),
    ).toEqual({ kind: "delete", id: "ev-9", previous: { title: "New" } });
    expect(
      inverseChange(
        {
          kind: "delete",
          id: "a",
          previous: { title: "A", start: "2026-10-20" },
        },
        undefined,
        () => "tmp-2",
      ),
    ).toEqual({
      kind: "create",
      tempId: "tmp-2",
      patch: { title: "A", start: "2026-10-20" },
    });
    expect(
      inverseChange(
        { ...move("s", "x"), occurrence: "2026-10-20", scope: "series" },
        undefined,
        () => "t",
      ),
    ).toBeNull();
    expect(
      inverseChange({ kind: "unschedule", id: "a" }, undefined, () => "t"),
    ).toBeNull();
  });
});

describe("changes merged", () => {
  it("keeps a new event a create with the fields of both", () => {
    expect(
      mergeChanges(
        { kind: "create", tempId: "t", patch: { title: "New", start: "a" } },
        {
          kind: "move",
          id: "t",
          patch: { start: "b" },
          previous: { start: "a" },
        },
      ),
    ).toEqual({
      kind: "create",
      tempId: "t",
      patch: { title: "New", start: "b" },
    });
  });

  it("turns a move and a resize into one move, and a form edit into an update", () => {
    const merged = mergeChanges(move("a", "x"), {
      kind: "resize",
      id: "a",
      patch: { end: "y" },
      previous: { end: "z" },
    });
    expect(merged).toMatchObject({
      kind: "move",
      patch: { start: "x", end: "y" },
    });
    expect(
      mergeChanges(move("a", "x"), {
        kind: "update",
        id: "a",
        patch: { title: "T" },
        previous: { title: "S" },
      })!.kind,
    ).toBe("update");
  });
});

describe("answers", () => {
  const data: AgendaData = {
    events: [
      { id: "a", title: "A", start: "2026-10-20T09:00:00+02:00" },
      { id: "tmp-1", title: "New", start: "2026-10-21T09:00:00+02:00" },
    ],
    unscheduled: [
      { id: "p1", title: "Client 1" },
      { id: "p2", title: "Client 2" },
    ],
    notices: [{ message: "Old" }],
  };

  it("puts the answered events in place of their temp ids, and the lists in place of the block's", () => {
    const next = applySaveAnswer(
      data,
      {
        events: [
          {
            id: "ev-1",
            tempId: "tmp-1",
            title: "New",
            start: "2026-10-21T09:00:00+02:00",
          },
        ],
        notices: [{ message: "New notice", tone: "error" }],
        backgrounds: [{ start: "2026-10-22", kind: "closed" }],
        unscheduled: [],
      },
      [{ kind: "create", tempId: "tmp-1", patch: { title: "New" } }],
    );
    expect(next.events.map((event) => event.id)).toEqual(["a", "ev-1"]);
    expect(next.events[1]).not.toHaveProperty("tempId");
    expect(next.notices).toEqual([{ message: "New notice", tone: "error" }]);
    expect(next.backgrounds).toHaveLength(1);
    expect(next.unscheduled).toEqual([]);
  });

  it("applies as sent a change the answer does not show, and removes what it removed", () => {
    const next = applySaveAnswer(data, { removed: ["tmp-1"] }, [
      move("a", "2026-10-22T09:00:00+02:00"),
    ]);
    expect(next.events).toEqual([
      { id: "a", title: "A", start: "2026-10-22T09:00:00+02:00" },
    ]);
  });

  it("takes a scheduled item out of the pending ones, and gives an unscheduled event back", () => {
    const scheduled = applySaveAnswer(
      data,
      {},
      [
        {
          kind: "schedule",
          id: "p1",
          tempId: "new-p1",
          patch: { start: "2026-10-23T08:00:00+02:00" },
        },
      ],
      () => ({ id: "new-p1", title: "Client 1", start: "" }),
    );
    expect(scheduled.unscheduled!.map((item) => item.id)).toEqual(["p2"]);
    expect(scheduled.events.at(-1)).toMatchObject({
      id: "new-p1",
      title: "Client 1",
    });
    const unscheduled = applySaveAnswer(data, {}, [
      { kind: "unschedule", id: "a" },
    ]);
    expect(unscheduled.unscheduled!.map((item) => item.id)).toEqual([
      "p1",
      "p2",
      "a",
    ]);
    expect(unscheduled.events.map((event) => event.id)).toEqual(["tmp-1"]);
  });

  it("reads again when a change leaves an id the route never named", () => {
    expect(
      leavesLocalId({}, [{ kind: "create", tempId: "t", patch: {} }]),
    ).toBe(true);
    expect(
      leavesLocalId(
        { events: [{ id: "e", tempId: "t", title: "", start: "" }] },
        [{ kind: "create", tempId: "t", patch: {} }],
      ),
    ).toBe(false);
    expect(leavesLocalId({}, [move("a", "x")])).toBe(false);
  });

  it("shows the pending items a staged schedule takes and an unschedule gives back", () => {
    const items = overlayPending(
      data.unscheduled!,
      [
        {
          key: "new-p1",
          status: "staged",
          change: { kind: "schedule", id: "p1", tempId: "new-p1" },
        },
        {
          key: "a",
          status: "staged",
          base: data.events[0],
          change: { kind: "unschedule", id: "a" },
        },
      ],
      "staged",
    );
    expect(items.map((item) => item.id)).toEqual(["p2", "a"]);
  });
});

describe("reading", () => {
  it("asks the route for the range, view, zone, search, shown calendars and facets", () => {
    expect(
      agendaFetchQuery({
        range: { from: "2026-10-19", to: "2026-10-25" },
        viewId: "week",
        timeZone: "Europe/Brussels",
        search: "  standup ",
        facetValues: { room: ["A", "B"], empty: [] },
        calendars: ["design", "product"],
      }),
    ).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
      view: "week",
      tz: "Europe/Brussels",
      q: "standup",
      calendars: "design,product",
      facet_room: "A,B",
    });
  });

  it("merges the block's calendars with the answer's, the answer winning", () => {
    expect(
      mergeById(
        [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        [
          { id: "b", label: "B2" },
          { id: "c", label: "C" },
        ],
      ),
    ).toEqual([
      { id: "a", label: "A" },
      { id: "b", label: "B2" },
      { id: "c", label: "C" },
    ]);
  });
});
