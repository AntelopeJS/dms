import { describe, expect, it } from "vitest";
import {
  commit,
  MOCKUP_HISTORY_LIMIT,
  redo,
  reset,
  revertTo,
  undo,
} from "../layers/dms-ui/app/entries/utils/mockupHistory";

describe("mockup history", () => {
  it("undoes and redoes back to exactly each state committed (fails on an off-by-one stack)", () => {
    let history = reset("a");
    history = commit(history, "b");
    history = commit(history, "c");
    history = undo(history);
    expect(history.present).toBe("b");
    history = undo(history);
    expect(history.present).toBe("a");
    expect(undo(history)).toBe(history);
    history = redo(history);
    history = redo(history);
    expect(history.present).toBe("c");
    expect(redo(history)).toBe(history);
  });

  it("drops what could be redone once a new state is committed (fails when redo replays a stale branch)", () => {
    const branched = commit(undo(commit(reset("a"), "b")), "x");
    expect(branched.future).toEqual([]);
    expect(redo(branched).present).toBe("x");
    expect(undo(branched).present).toBe("a");
  });

  it("joins consecutive commits with the same key into one undo step (fails when typing makes a step per keystroke)", () => {
    let history = reset("");
    for (const text of ["R", "Re", "Rev"]) {
      history = commit(history, text, "/pages/0/tree/0:title");
    }
    history = commit(history, "Rev!", "/pages/0/tree/0:subtitle");
    expect(undo(history).present).toBe("Rev");
    expect(undo(undo(history)).present).toBe("");
  });

  it("starts a new step after an undo even when the key repeats (fails when an undo is merged away)", () => {
    const typed = commit(commit(reset(""), "a", "k"), "ab", "k");
    const again = commit(undo(typed), "ax", "k");
    expect(undo(again).present).toBe("");
    expect(again.past).toEqual([""]);
  });

  it("keeps a bounded number of undo steps (fails when the past grows without limit)", () => {
    let history = reset(0);
    for (let step = 1; step <= MOCKUP_HISTORY_LIMIT + 5; step += 1) {
      history = commit(history, step);
    }
    expect(history.past).toHaveLength(MOCKUP_HISTORY_LIMIT);
    expect(history.past[0]).toBe(5);
  });

  it("resets to a state with nothing to undo or redo (fails when an adopted file can be undone into)", () => {
    expect(reset("file")).toEqual({ past: [], present: "file", future: [] });
  });

  it("reverts to the last written state, dropping the steps after it and what could be redone (fails when the next undo lands on the written state itself)", () => {
    const history = commit(commit(commit(reset("a"), "b"), "c"), "d");
    const reverted = revertTo(undo(history), "b");
    expect(reverted).toEqual({ past: ["a"], present: "b", future: [] });
    expect(undo(reverted).present).toBe("a");
  });

  it("keeps the whole past when the written state was merged into a later one (fails when the past is emptied)", () => {
    expect(revertTo(commit(reset("a"), "c"), "b")).toEqual({
      past: ["a"],
      present: "b",
      future: [],
    });
  });
});
