/**
 * The FullAgenda save engine: immediate writes (Saving, refused and put
 * back, Retry), one write at a time per event, staged changes merged per
 * event and dropped when put back, `confirm` answered with `force`,
 * conflicts (Overwrite / Discard), events gone, Undo, and changes merged.
 */
import { describe, expect, it, vi } from "vitest";
import {
  inverseChange,
  mergeChanges,
  overlayEdits,
} from "../layers/dms-ui/app/build/composables/agenda/agendaChanges";
import { harness, flush, move } from "./helpers/agenda-save-harness";

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

  it("drops a refused change (the event is back), tells it, and Retry writes it again", async () => {
    const { engine, answer, failed, failedEdits, pending } =
      harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [{ index: 0, message: "Room taken", code: "refused" }],
    });
    expect(engine.count.value).toBe(0);
    expect(engine.hasUnsaved.value).toBe(false);
    expect(failed).toEqual([["a"]]);
    expect(failedEdits[0]).toMatchObject({
      status: "error",
      message: "Room taken",
    });
    void engine.resend(failedEdits[0]!);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request.changes[0]).toMatchObject({
      id: "a",
      patch: { start: "2026-10-21T09:00:00+02:00" },
    });
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("never sends a refused move again with a later change of the event (#5)", async () => {
    const { engine, answer, pending } = harness("immediate");
    void engine.record(move("a", "2026-10-21T22:00:00+02:00"));
    await answer({ errors: [{ index: 0, message: "Too late" }] });
    void engine.record({
      kind: "update",
      id: "a",
      patch: { title: "Renamed" },
      previous: { title: "A" },
    });
    expect(pending[0]!.request.changes).toEqual([
      {
        kind: "update",
        id: "a",
        patch: { title: "Renamed" },
        previous: { title: "A" },
      },
    ]);
  });

  it("tells the message of a request that failed as a whole", async () => {
    const { engine, answer, failedEdits } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer(new Error("Network down"));
    expect(engine.count.value).toBe(0);
    expect(failedEdits[0]).toMatchObject({
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

  it("holds a conflict until Overwrite writes it with overwrite, not force", async () => {
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
    expect(engine.hasUnsaved.value).toBe(false);
    void engine.overwrite("a");
    expect(pending[0]!.request.overwrite).toBe(true);
    expect(pending[0]!.request.force).toBeUndefined();
    await answer({});
    expect(engine.count.value).toBe(0);
  });

  it("asks a confirm met after Overwrite, then posts overwrite and force (#17)", async () => {
    const { engine, answer, pending, confirm } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [{ index: 0, message: "Moved", code: "conflict", current }],
    });
    void engine.overwrite("a");
    await answer({ confirm: { title: "Before its predecessor?" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(pending[0]!.request).toMatchObject({ overwrite: true, force: true });
  });

  it("refuses a confirm asked again under force instead of asking forever (#54)", async () => {
    const { engine, answer, pending, confirm, failedEdits } =
      harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({ confirm: { title: "Sure?" } });
    await answer({ confirm: { title: "Sure?" } });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(0);
    expect(failedEdits[0]).toMatchObject({ message: "Sure?" });
  });

  it("sends a later change of an event in conflict, so the route checks it again (#5)", async () => {
    const { engine, answer, pending } = harness("immediate");
    void engine.record(move("a", "2026-10-21T09:00:00+02:00"));
    await answer({
      errors: [{ index: 0, message: "Moved", code: "conflict", current }],
    });
    void engine.record({
      kind: "update",
      id: "a",
      patch: { title: "T" },
      previous: { title: "A" },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.request.overwrite).toBeUndefined();
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
