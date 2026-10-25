/**
 * The Matrix block's save engine: immediate writes, staged edits that
 * unstage when put back, refusals and conflicts kept in their cells,
 * Overwrite, targets holding the writes, and Undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMatrixSaveEngine,
  type MatrixSaveEngineOptions,
} from "../layers/dms-ui/app/build/composables/matrix/matrixSaveEngine";
import type {
  MatrixSaveMode,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "../layers/dms-ui/app/types/matrix";

interface Harness {
  engine: ReturnType<typeof createMatrixSaveEngine>;
  requests: MatrixSaveRequest[];
  answer: (response: MatrixSaveResponse | Error) => void;
  blocked: { value: boolean };
  saved: unknown[][];
}

function harness(
  mode: MatrixSaveMode,
  overrides: Partial<MatrixSaveEngineOptions> = {},
): Harness {
  const requests: MatrixSaveRequest[] = [];
  let next: MatrixSaveResponse | Error = {};
  const blocked = { value: false };
  const saved: unknown[][] = [];
  const engine = createMatrixSaveEngine({
    mode: () => mode,
    send: async (request) => {
      requests.push(request);
      if (next instanceof Error) throw next;
      return next;
    },
    isBlocked: () => blocked.value,
    describeError: (error) => (error as Error).message,
    onSaved: (changes) => saved.push(changes),
    ...overrides,
  });
  return {
    engine,
    requests,
    answer: (response) => {
      next = response;
    },
    blocked,
    saved,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("immediate mode", () => {
  it("writes each committed cell at once, then says Saved for a moment", async () => {
    const { engine, requests } = harness("immediate");
    const done = engine.commit({
      rowId: "r1",
      columnId: "fr",
      value: "Bonjour",
      original: "",
    });
    expect(engine.stateOf("r1", "fr")).toBe("saving");
    expect(await done).toBe(true);
    expect(requests).toEqual([
      {
        changes: [
          { rowId: "r1", columnId: "fr", value: "Bonjour", previous: "" },
        ],
      },
    ]);
    expect(engine.stateOf("r1", "fr")).toBe("saved");
    vi.advanceTimersByTime(2000);
    expect(engine.stateOf("r1", "fr")).toBe("idle");
    expect(engine.hasUnsaved.value).toBe(false);
  });

  it("writes nothing for a value left as it was", async () => {
    const { engine, requests } = harness("immediate");
    await engine.commit({ rowId: "r1", columnId: "a", value: 3, original: 3 });
    expect(requests).toHaveLength(0);
  });

  it("keeps the draft and the message of a failed request, to retry", async () => {
    const { engine, answer, requests } = harness("immediate");
    answer(new Error("Network down"));
    expect(
      await engine.commit({
        rowId: "r1",
        columnId: "a",
        value: 5,
        original: 1,
      }),
    ).toBe(false);
    expect(engine.stateOf("r1", "a")).toBe("error");
    expect(engine.editOf("r1", "a")?.message).toBe("Network down");
    expect(engine.valueOf("r1", "a", 1)).toBe(5);
    expect(engine.hasUnsaved.value).toBe(true);
    answer({});
    expect(await engine.retry("r1", "a")).toBe(true);
    expect(requests).toHaveLength(2);
    expect(engine.stateOf("r1", "a")).toBe("saved");
  });

  it("discards a failed draft", async () => {
    const { engine, answer } = harness("immediate");
    answer(new Error("boom"));
    await engine.commit({ rowId: "r1", columnId: "a", value: 5, original: 1 });
    engine.discard("r1", "a");
    expect(engine.valueOf("r1", "a", 1)).toBe(1);
    expect(engine.hasUnsaved.value).toBe(false);
  });

  it("holds the writes while a blockSave target is missed, then sends them together", async () => {
    const { engine, requests, blocked } = harness("immediate");
    blocked.value = true;
    await engine.commit({
      rowId: "ENT",
      columnId: "38",
      value: 10,
      original: 0,
    });
    expect(requests).toHaveLength(0);
    expect(engine.stateOf("ENT", "38")).toBe("pending");
    expect(engine.heldCount.value).toBe(1);
    blocked.value = false;
    await engine.commit({
      rowId: "NE1",
      columnId: "38",
      value: 14,
      original: 0,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.changes.map((change) => change.rowId)).toEqual([
      "ENT",
      "NE1",
    ]);
  });
});

describe("staged mode", () => {
  it("keeps the edits until saved, and unstages a cell put back as it was", async () => {
    const { engine, requests } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.commit({ rowId: "r2", columnId: "a", value: 9, original: 8 });
    expect(requests).toHaveLength(0);
    expect(engine.count.value).toBe(2);
    expect(engine.editOf("r1", "a")).toMatchObject({ before: 1, after: 2 });
    await engine.commit({ rowId: "r1", columnId: "a", value: 7, original: 1 });
    expect(engine.editOf("r1", "a")).toMatchObject({ before: 1, after: 7 });
    await engine.commit({ rowId: "r1", columnId: "a", value: 1, original: 1 });
    expect(engine.editOf("r1", "a")).toBeUndefined();
    expect(engine.count.value).toBe(1);
  });

  it("writes every edit in one request", async () => {
    const { engine, requests, saved } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.commit({
      rowId: "r1",
      columnId: "b",
      value: "x",
      original: "",
    });
    expect(await engine.saveAll()).toBe(true);
    expect(requests[0]!.changes).toHaveLength(2);
    expect(engine.count.value).toBe(0);
    expect(saved).toHaveLength(1);
  });

  it("refuses to save while a blockSave target is missed", async () => {
    const { engine, requests, blocked } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    blocked.value = true;
    expect(await engine.saveAll()).toBe(false);
    expect(requests).toHaveLength(0);
    expect(engine.count.value).toBe(1);
  });

  it("puts the route's errors on their cells and rows, and writes the rest", async () => {
    const { engine, answer } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.commit({ rowId: "r2", columnId: "a", value: 3, original: 1 });
    await engine.commit({ rowId: "r3", columnId: "a", value: 4, original: 1 });
    answer({
      errors: [
        { rowId: "r1", columnId: "a", message: "Too many" },
        { rowId: "r2", message: "Row locked" },
      ],
    });
    expect(await engine.saveAll()).toBe(false);
    expect(engine.editOf("r1", "a")).toMatchObject({
      status: "failed",
      message: "Too many",
    });
    expect(engine.editOf("r2", "a")?.message).toBe("Row locked");
    expect(engine.rowErrors.get("r2")).toBe("Row locked");
    expect(engine.editOf("r3", "a")).toBeUndefined();
    expect(engine.count.value).toBe(2);
  });

  it("fails every change of a request answered non-2xx", async () => {
    const { engine, answer } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.commit({ rowId: "r2", columnId: "a", value: 3, original: 1 });
    answer(new Error("500"));
    expect(await engine.saveAll()).toBe(false);
    expect(engine.edits.value.map((edit) => edit.status)).toEqual([
      "failed",
      "failed",
    ]);
  });

  it("hands the answer's rows over", async () => {
    const onResponse = vi.fn();
    const { engine, answer } = harness("staged", { onResponse });
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    const response = { rows: [{ id: "r1", values: { a: 2 } }] };
    answer(response);
    await engine.saveAll();
    expect(onResponse).toHaveBeenCalledWith(response);
  });

  it("discards every staged edit", async () => {
    const { engine } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    engine.discardAll();
    expect(engine.hasUnsaved.value).toBe(false);
  });
});

describe("conflicts", () => {
  it("shows the stored value and overwrites it on demand, with force", async () => {
    const onConflict = vi.fn();
    const { engine, answer, requests } = harness("immediate", { onConflict });
    answer({ conflicts: [{ rowId: "k", columnId: "fr", current: "Salut" }] });
    await engine.commit({
      rowId: "k",
      columnId: "fr",
      value: "Bonjour",
      original: "",
    });
    expect(engine.stateOf("k", "fr")).toBe("conflict");
    expect(engine.editOf("k", "fr")?.conflict).toEqual({ current: "Salut" });
    expect(onConflict).toHaveBeenCalledWith({
      rowId: "k",
      columnId: "fr",
      current: "Salut",
    });
    answer({});
    expect(await engine.overwrite("k", "fr")).toBe(true);
    expect(requests[1]).toEqual({
      changes: [
        { rowId: "k", columnId: "fr", value: "Bonjour", previous: "Salut" },
      ],
      force: true,
    });
    expect(engine.stateOf("k", "fr")).toBe("saved");
  });

  it("discards the draft of a conflict", async () => {
    const { engine, answer } = harness("immediate");
    answer({ conflicts: [{ rowId: "k", columnId: "fr", current: "Salut" }] });
    await engine.commit({
      rowId: "k",
      columnId: "fr",
      value: "B",
      original: "",
    });
    engine.discard("k", "fr");
    expect(engine.editOf("k", "fr")).toBeUndefined();
  });
});

describe("undo", () => {
  it("writes the previous values back", async () => {
    const { engine, requests } = harness("staged");
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.saveAll();
    expect(engine.lastSaved.value).toEqual([
      { rowId: "r1", columnId: "a", value: 2, previous: 1 },
    ]);
    expect(await engine.undo(engine.lastSaved.value)).toBe(true);
    expect(requests[1]).toEqual({
      changes: [{ rowId: "r1", columnId: "a", value: 1, previous: 2 }],
    });
  });

  it("says when the route refused the undo", async () => {
    const { engine, answer } = harness("staged");
    answer(new Error("gone"));
    expect(
      await engine.undo([
        { rowId: "r1", columnId: "a", value: 2, previous: 1 },
      ]),
    ).toBe(false);
  });
});

it("remembers the rows edited in the view", async () => {
  const { engine } = harness("staged");
  await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
  expect([...engine.touchedRows]).toEqual(["r1"]);
});

describe("fix round 1", () => {
  it("shows the value written when the answer returns no row (1)", async () => {
    const onWritten = vi.fn();
    const { engine, answer } = harness("staged", { onWritten });
    await engine.commit({ rowId: "r1", columnId: "a", value: 2, original: 1 });
    await engine.commit({ rowId: "r2", columnId: "a", value: 5, original: 4 });
    answer({ rows: [{ id: "r2", values: { a: 5 } }] });
    await engine.saveAll();
    expect(onWritten).toHaveBeenCalledWith([
      { rowId: "r1", columnId: "a", value: 2 },
    ]);
  });

  it("shows the value an undo wrote back (1)", async () => {
    const onWritten = vi.fn();
    const { engine, answer } = harness("staged", { onWritten });
    answer({ errors: [{ rowId: "r2", columnId: "a", message: "No" }] });
    await engine.undo([
      { rowId: "r1", columnId: "a", value: 2, previous: 1 },
      { rowId: "r2", columnId: "a", value: 5, previous: 4 },
    ]);
    expect(onWritten).toHaveBeenLastCalledWith([
      { rowId: "r1", columnId: "a", value: 1 },
    ]);
  });

  it("never writes over a conflict by saving every edit (2)", async () => {
    const { engine, answer, requests } = harness("staged");
    await engine.commit({
      rowId: "k",
      columnId: "fr",
      value: "B",
      original: "A",
    });
    await engine.commit({
      rowId: "k",
      columnId: "de",
      value: "D",
      original: "C",
    });
    answer({ conflicts: [{ rowId: "k", columnId: "fr", current: "Z" }] });
    await engine.saveAll();
    // The edit keeps the value it started from; the stored one is apart.
    expect(engine.editOf("k", "fr")).toMatchObject({
      before: "A",
      conflict: { current: "Z" },
    });
    answer({});
    await engine.commit({
      rowId: "k",
      columnId: "it",
      value: "I",
      original: "",
    });
    await engine.saveAll();
    expect(requests[1]!.changes.map((change) => change.columnId)).toEqual([
      "it",
    ]);
    expect(engine.stateOf("k", "fr")).toBe("conflict");
    expect(await engine.overwrite("k", "fr")).toBe(true);
    expect(requests[2]).toMatchObject({
      force: true,
      changes: [{ rowId: "k", columnId: "fr", value: "B", previous: "Z" }],
    });
  });

  it("waits for a cell's write before sending its next value (6)", async () => {
    let release: (response: MatrixSaveResponse) => void = () => {};
    const requests: MatrixSaveRequest[] = [];
    const engine = createMatrixSaveEngine({
      mode: () => "immediate",
      send: (request) => {
        requests.push(request);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      isBlocked: () => false,
      describeError: String,
    });
    const first = engine.commit({
      rowId: "r",
      columnId: "a",
      value: 2,
      original: 1,
    });
    await engine.commit({ rowId: "r", columnId: "a", value: 3, original: 1 });
    expect(requests).toHaveLength(1);
    expect(engine.valueOf("r", "a", 1)).toBe(3);
    release({});
    await first;
    expect(requests).toHaveLength(2);
    expect(requests[1]!.changes).toEqual([
      { rowId: "r", columnId: "a", value: 3, previous: 2 },
    ]);
  });

  it("writes a revert made during a save once it settled (6)", async () => {
    let release: (response: MatrixSaveResponse) => void = () => {};
    const requests: MatrixSaveRequest[] = [];
    const engine = createMatrixSaveEngine({
      mode: () => "immediate",
      send: (request) => {
        requests.push(request);
        return new Promise((resolve) => {
          release = resolve;
        });
      },
      isBlocked: () => false,
      describeError: String,
    });
    const first = engine.commit({
      rowId: "r",
      columnId: "a",
      value: 2,
      original: 1,
    });
    await engine.commit({ rowId: "r", columnId: "a", value: 1, original: 1 });
    release({});
    await first;
    expect(requests[1]!.changes).toEqual([
      { rowId: "r", columnId: "a", value: 1, previous: 2 },
    ]);
  });

  it("refuses Overwrite while a blockSave target is missed (17)", async () => {
    const { engine, answer, requests, blocked } = harness("immediate");
    answer({ conflicts: [{ rowId: "k", columnId: "a", current: 9 }] });
    await engine.commit({ rowId: "k", columnId: "a", value: 2, original: 1 });
    blocked.value = true;
    expect(await engine.overwrite("k", "a")).toBe(false);
    expect(requests).toHaveLength(1);
  });
});
