// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MOCKUP_RETRY_DELAY_MS,
  MOCKUP_WRITE_DELAY_MS,
} from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import { initialSpec } from "./helpers/mockup-spec-file";
import {
  mountEditor,
  retitle,
  session,
  settle,
  streamSaysTheFileChanged,
  TITLE,
  titleOf,
  useSpecEditor,
} from "./helpers/mockup-spec-editor";

useSpecEditor();

describe("writing the spec", () => {
  it("writes one burst of typing once, the latest spec winning, with the digest it read (fails on a write per keystroke or a stale spec)", async () => {
    await mountEditor();
    for (const title of ["T", "Tu", "Turnover"]) retitle(title);
    await settle(MOCKUP_WRITE_DELAY_MS - 1);
    expect(session.file.writes).toEqual([]);
    await settle(1);
    expect(session.file.writes).toHaveLength(1);
    expect(session.file.writes[0]?.digest).toBe("d1");
    expect(titleOf(session.file.spec)).toBe("Turnover");
  });

  it("undoes and redoes to exactly the specs before and after, and writes each (fails when undo leaves the file behind)", async () => {
    await mountEditor();
    retitle("Turnover");
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(session.file.spec).toEqual(initialSpec());
    expect(session.editor.canRedo.value).toBe(true);
    session.editor.redo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Turnover");
    expect(session.file.writes.map((write) => write.digest)).toEqual([
      "d1",
      "d2",
      "d3",
    ]);
  });

  it("sends an edit made during a write after it, with the digest that write answered (fails on a 409 against its own write)", async () => {
    await mountEditor();
    let release: (() => void) | undefined;
    const slow = session.file.fetch.getMockImplementation();
    if (!slow) throw new Error("the file fetch has no implementation");
    session.file.fetch.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => (release = resolve));
      return slow(url, init);
    });
    retitle("First");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Second");
    await settle(MOCKUP_WRITE_DELAY_MS);
    release?.();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(
      session.file.writes.map((write) => [write.digest, titleOf(write.spec)]),
    ).toEqual([
      ["d1", "First"],
      ["d2", "Second"],
    ]);
    expect(session.notices).toEqual([]);
  });
});

describe("another writer", () => {
  it("takes the file another writer changed, starts its history over and says so (fails when the edit page keeps a stale spec)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    const theirs = initialSpec();
    theirs.title = "From the AI";
    session.file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    expect(session.editor.spec.value).toEqual(theirs);
    expect(session.editor.canUndo.value).toBe(false);
    expect(session.notices).toEqual([{ kind: "adopted" }]);
  });

  it("says nothing when the stream only reports its own write (fails on a toast per edit)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();
    expect(session.notices).toEqual([]);
    expect(session.editor.canUndo.value).toBe(true);
  });

  it("never writes over a file changed since it read it: a 409 takes the file instead (fails when the AI's write is overwritten)", async () => {
    await mountEditor();
    const theirs = initialSpec();
    theirs.title = "From the AI";
    session.file.writeFromOutside(theirs);
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(session.file.spec).toEqual(theirs);
    expect(session.editor.spec.value).toEqual(theirs);
    expect(session.notices).toEqual([{ kind: "adopted" }]);
  });
});

describe("a refused write", () => {
  it("shows the first error and goes back to the spec it last wrote (fails when the refused spec stays on screen)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.file.refuse = {
      path: "/pages/0/tree/0/options/title",
      message: "Required",
    };
    retitle("Bad");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(session.notices).toEqual([
      {
        kind: "refused",
        issue: { path: "/pages/0/tree/0/options/title", message: "Required" },
        discarded: false,
      },
    ]);
    expect(titleOf(session.editor.spec.value)).toBe("Good");
    expect(titleOf(session.file.spec)).toBe("Good");
    await settle(MOCKUP_WRITE_DELAY_MS * 4);
    expect(session.file.writes).toHaveLength(2);
  });

  it("leaves no undo step that changes nothing: the next undo goes to the spec before the last written one (fails when the history keeps the refused edit's step)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.file.refuse = { path: "/pages/0/tree/0/options/x", message: "Bad" };
    session.editor.apply({
      kind: "setOption",
      pointer: TITLE,
      key: "x",
      value: "y",
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.file.refuse = undefined;

    session.editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(session.editor.spec.value).toEqual(initialSpec());
    expect(session.file.spec).toEqual(initialSpec());
    expect(session.editor.canUndo.value).toBe(false);
  });

  it("drops the edits typed while the refused write was in flight and says so (fails when they vanish without a word or are written over the refused spec)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.file.refuse = { path: "/pages/0/tree/0/options/x", message: "Bad" };
    let release: (() => void) | undefined;
    const real = session.file.fetch.getMockImplementation();
    if (!real) throw new Error("the file fetch has no implementation");
    session.file.fetch.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => (release = resolve));
      return real(url, init);
    });
    session.editor.apply({
      kind: "setOption",
      pointer: TITLE,
      key: "x",
      value: "y",
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Typed meanwhile");
    release?.();
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(titleOf(session.editor.spec.value)).toBe("Good");
    expect(
      session.editor.spec.value?.pages[0]?.tree[0]?.options,
    ).not.toHaveProperty("x");
    expect(session.notices).toEqual([
      {
        kind: "refused",
        issue: { path: "/pages/0/tree/0/options/x", message: "Bad" },
        discarded: true,
      },
    ]);
    expect(session.file.writes).toHaveLength(2);
  });
});

describe("a write that fails", () => {
  it("is retried after a short backoff until it lands, the notice staying until then (fails when a 500 leaves the edit unwritten)", async () => {
    await mountEditor();
    session.file.failures = 2;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Revenue");
    expect(session.editor.hasFailed.value).toBe(true);
    await settle(10_000);
    expect(titleOf(session.file.spec)).toBe("Mine");
    expect(session.editor.hasFailed.value).toBe(false);
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("is retried at the next stream state, without waiting for the backoff (fails when only a timer retries)", async () => {
    await mountEditor();
    session.file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Revenue");
    await streamSaysTheFileChanged();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Mine");
  });

  it("is retried with the next edit, which it carries (fails when the new edit waits behind the failed one)", async () => {
    await mountEditor();
    session.file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Mine, again");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Mine, again");
    expect(session.editor.hasFailed.value).toBe(false);
  });

  it("gives way to a file another writer changed meanwhile, and the notice goes (fails when the retry overwrites the AI)", async () => {
    await mountEditor();
    session.file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    const theirs = initialSpec();
    theirs.title = "From the AI";
    session.file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    await settle(10_000);
    expect(session.file.spec).toEqual(theirs);
    expect(session.editor.spec.value).toEqual(theirs);
    expect(session.editor.hasFailed.value).toBe(false);
  });
});

describe("a write whose answer was lost", () => {
  it("counts as landed when the retry finds the file holding it, keeping the history (fails when the editor adopts its own write and wipes undo)", async () => {
    session.file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);

    await settle(MOCKUP_RETRY_DELAY_MS);

    expect(titleOf(session.file.spec)).toBe("A");
    expect(session.editor.canUndo.value).toBe(true);
    expect(session.editor.hasFailed.value).toBe(false);
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("then writes the edit typed before the retry (fails when that edit is dropped)", async () => {
    session.file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("AB");

    await settle(MOCKUP_RETRY_DELAY_MS * 4);

    expect(titleOf(session.file.spec)).toBe("AB");
    expect(titleOf(session.editor.spec.value)).toBe("AB");
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("several writes whose answers were lost", () => {
  it("counts the file as its own write when it holds any of them, then writes the spec shown (fails when only the last one sent is remembered)", async () => {
    session.file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);
    session.file.failures = 1;
    retitle("AB");

    await settle(MOCKUP_RETRY_DELAY_MS * 8);

    expect(titleOf(session.file.spec)).toBe("AB");
    expect(session.editor.canUndo.value).toBe(true);
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("writes the spec an undo went back to, even when it matches the last answered write (fails when the file keeps the undone edit)", async () => {
    session.file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);

    session.editor.undo();
    await settle(MOCKUP_RETRY_DELAY_MS * 4);

    expect(titleOf(session.file.spec)).toBe("Revenue");
    expect(titleOf(session.editor.spec.value)).toBe("Revenue");
    expect(session.editor.hasFailed.value).toBe(false);
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("a spec.json the editor cannot read", () => {
  it("is no failed save: nothing was edited, so nothing is reported, and the editor waits for a readable file (fails on a 'could not be saved' toast per read)", async () => {
    session.file.isInvalid = true;
    await mountEditor();
    await streamSaysTheFileChanged();

    expect(session.notices).toEqual([]);
    expect(session.editor.hasFailed.value).toBe(false);
    expect(session.editor.spec.value).toBeUndefined();

    session.file.isInvalid = false;
    await streamSaysTheFileChanged();

    expect(titleOf(session.editor.spec.value)).toBe("Revenue");
    expect(session.notices).toEqual([]);
    expect(session.file.writes).toEqual([]);
  });

  it("is no failed save when the server does not answer the read either (fails when an unanswered read toasts)", async () => {
    session.file.readFailures = 2;
    await mountEditor();
    await streamSaysTheFileChanged();

    expect(session.notices).toEqual([]);
    expect(session.editor.hasFailed.value).toBe(false);
  });
});

describe("a conflict whose file cannot be read", () => {
  it("backs off like any failed write instead of writing again at once (fails on a write every few milliseconds)", async () => {
    await mountEditor();
    session.file.writeFromOutside(initialSpec());
    session.file.readFailures = Number.POSITIVE_INFINITY;
    retitle("Mine");

    await settle(5000);

    expect(session.file.writes.length).toBeLessThanOrEqual(5);
    expect(session.editor.hasFailed.value).toBe(true);
    expect(session.notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("the notice of a failed write", () => {
  it("goes once the spec an undo went back to is confirmed, when the server answers again (fails when the retry banner outlives every pending edit)", async () => {
    session.file.failures = Number.POSITIVE_INFINITY;
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(session.editor.hasFailed.value).toBe(true);
    session.editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    session.file.failures = 0;
    await settle(MOCKUP_RETRY_DELAY_MS * 16);

    expect(titleOf(session.file.spec)).toBe("Revenue");
    expect(session.editor.hasFailed.value).toBe(false);
  });
});

describe("a write that landed", () => {
  it("stays pending until the stream sends a state after it (fails when the old compiled paths count as the new spec's)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(session.file.spec)).toBe("Mine");
    expect(session.editor.isPending.value).toBe(true);

    await streamSaysTheFileChanged();

    expect(session.editor.isPending.value).toBe(false);
  });

  it("is not pending when the stream sent its state before the write's answer came (fails when clicks stay ignored until the next edit)", async () => {
    let release = (): void => undefined;
    session.file.answerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();

    release();
    await settle(MOCKUP_RETRY_DELAY_MS);

    expect(titleOf(session.file.spec)).toBe("Mine");
    expect(session.editor.isPending.value).toBe(false);
  });
});

describe("adopting a change from outside", () => {
  it("reports the spec it dropped and the one it took, for a stream state and for a 409, and not for its own write (fails when an editing session cannot tell)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();
    expect(session.editor.adoption.value).toBeUndefined();

    const theirs = initialSpec();
    theirs.title = "From the AI";
    session.file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    expect(titleOf(session.editor.adoption.value?.previous)).toBe("Mine");
    expect(session.editor.adoption.value?.next).toEqual(theirs);

    const first = session.editor.adoption.value;
    const later = initialSpec();
    later.title = "Again";
    session.file.writeFromOutside(later);
    retitle("Conflicting");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(session.editor.adoption.value).not.toBe(first);
    expect(session.editor.adoption.value?.next).toEqual(later);
  });
});
