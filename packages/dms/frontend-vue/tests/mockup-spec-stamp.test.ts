/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  MOCKUP_RETRY_DELAY_MS,
  MOCKUP_WRITE_DELAY_MS,
} from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type {
  MockupSpecDocument,
  MockupSpecNode,
} from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  editor,
  file,
  mountEditor,
  notices,
  retitle,
  settle,
  streamSaysTheFileChanged,
  useSpecEditor,
} from "./helpers/mockup-spec-editor";

useSpecEditor();

const STAMP = "b-k3j9x0qz";
const OTHER_STAMP = "b-aaaaaaaa";

function kpi(title: string): MockupSpecNode {
  return { type: "KpiCard", options: { title } };
}

function onePage(...tree: MockupSpecNode[]): MockupSpecDocument {
  return { version: 1, pages: [{ id: "orders", title: "Orders", tree }] };
}

/** `spec` with the id `ids` holds for each index on the root at that index, as a note's stamp writes it. */
function stamped(
  spec: MockupSpecDocument,
  ids = new Map([[0, STAMP]]),
): MockupSpecDocument {
  const [page, ...rest] = spec.pages;
  if (!page) return spec;
  const tree = page.tree.map((node, index) => {
    const id = ids.get(index);
    return id === undefined ? node : { ...node, id };
  });
  return { ...spec, pages: [{ ...page, tree }, ...rest] };
}

/** The title and the id of each root of `spec.json`. */
function roots(): unknown[][] {
  return (file.spec.pages[0]?.tree ?? []).map((node) => [
    node.options?.title,
    node.id,
  ]);
}

async function stampFile(ids?: Map<number, string>): Promise<void> {
  file.writeFromOutside(stamped(file.spec, ids));
  await streamSaysTheFileChanged();
}

describe("an id a note stamped on the file", () => {
  it("counts a file that adds an id and changes anything else as another writer's change (fails when any added id passes for a stamp)", async () => {
    await mountEditor();

    file.writeFromOutside({ ...stamped(file.spec), title: "From the AI" });
    await streamSaysTheFileChanged();

    expect(notices).toEqual([{ kind: "adopted" }]);
  });

  it("keeps the history and says nothing, and the spec shown takes the id (fails when a stamp counts as another writer's change)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);

    await stampFile();

    expect(editor.canUndo.value).toBe(true);
    expect(notices).toEqual([]);
    expect(editor.spec.value).toEqual(file.spec);
    expect(roots()).toEqual([["Mine", STAMP]]);
  });

  it("writes an edit typed after the stamp over the stamped file, keeping the id (fails when the conflict drops the edit or the id)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);

    file.writeFromOutside(stamped(file.spec));
    retitle("Mine, again");
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(roots()).toEqual([["Mine, again", STAMP]]);
    expect(editor.spec.value).toEqual(file.spec);
    expect(editor.canUndo.value).toBe(true);
    expect(notices).toEqual([]);
  });

  it("takes a stamp on a write whose answer was lost as its own, keeping the history (fails when only the spec last answered counts as the editor's)", async () => {
    file.lostAnswers = 1;
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);

    await stampFile();
    await settle(MOCKUP_RETRY_DELAY_MS * 4);

    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
    expect(editor.canUndo.value).toBe(true);
    expect(editor.hasFailed.value).toBe(false);
    expect(roots()).toEqual([["Mine", STAMP]]);
  });
});

describe("an id a note stamped, through undo and redo", () => {
  it("keeps the id on its block through an undo and a redo of the block's retitle (fails when an edited block is found by its content, and the undo writes it without the id)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await stampFile();

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    const undone = roots();
    editor.redo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(undone).toEqual([["Revenue", STAMP]]);
    expect(roots()).toEqual([["Mine", STAMP]]);
    expect(notices).toEqual([]);
  });

  it("gives an undone step each id on the very block it was stamped on, twins included (fails when a block is found by its content, which cannot tell twins apart)", async () => {
    file.spec = onePage(kpi("A"), kpi("B"), kpi("B"));
    await mountEditor();
    editor.apply({
      kind: "insertNode",
      parent: null,
      page: "orders",
      index: 0,
      node: { type: "Banner" },
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    await stampFile(
      new Map([
        [1, OTHER_STAMP],
        [3, STAMP],
      ]),
    );

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(roots()).toEqual([
      ["A", OTHER_STAMP],
      ["B", undefined],
      ["B", STAMP],
    ]);
    expect(notices).toEqual([]);
  });

  it("gives the block a duplicate was made from none of the id a note stamped on the duplicate, through an undo and a redo (fails when the duplicate's id lands on its original)", async () => {
    file.spec = onePage(kpi("A"));
    await mountEditor();
    editor.apply({ kind: "duplicateNode", pointer: "/pages/0/tree/0" });
    await settle(MOCKUP_WRITE_DELAY_MS);
    await stampFile(new Map([[1, STAMP]]));

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    const undone = roots();
    editor.redo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(undone).toEqual([["A", undefined]]);
    expect(roots()).toEqual([
      ["A", undefined],
      ["A", STAMP],
    ]);
  });

  it("keeps the id on a block through the undo of a move of an earlier block into it, which shifts the block (fails when the undo looks for the block at its pointer alone)", async () => {
    file.spec = onePage(kpi("K"), {
      type: "ChartCard",
      options: { title: "Sales" },
      children: [{ id: "chart", type: "ChartArea" }],
    });
    await mountEditor();
    editor.apply({
      kind: "moveNode",
      from: "/pages/0/tree/0",
      parent: "/pages/0/tree/1",
      index: 0,
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    await stampFile();

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(roots()).toEqual([
      ["K", undefined],
      ["Sales", STAMP],
    ]);
    expect(notices).toEqual([]);
  });
});

describe("an id a note stamped while an edit is not written yet", () => {
  it("puts the id on the stamped block when a move took it from its place (fails when the spec shown takes the id at the block's old pointer)", async () => {
    file.spec = onePage(kpi("A"), kpi("B"), kpi("C"));
    await mountEditor();

    editor.apply({
      kind: "moveNode",
      from: "/pages/0/tree/0",
      parent: null,
      index: 2,
    });
    await stampFile();
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(roots()).toEqual([
      ["B", undefined],
      ["C", undefined],
      ["A", STAMP],
    ]);
    expect(notices).toEqual([]);
  });

  it("puts the id on the twin the note was on when an insert shifted it (fails when a block is found by its content, which cannot tell twins apart)", async () => {
    file.spec = onePage(kpi("B"), kpi("B"));
    await mountEditor();

    editor.apply({
      kind: "insertNode",
      parent: null,
      page: "orders",
      index: 0,
      node: { type: "Banner" },
    });
    await stampFile(new Map([[1, STAMP]]));
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(roots()).toEqual([
      [undefined, undefined],
      ["B", undefined],
      ["B", STAMP],
    ]);
    expect(notices).toEqual([]);
  });

  it("gives no other block the id of a block a removal took out, and an undo puts the block back with it (fails when the id falls to the block now at the old pointer)", async () => {
    file.spec = onePage(kpi("A"), kpi("B"));
    await mountEditor();

    editor.apply({ kind: "removeNode", pointer: "/pages/0/tree/0" });
    await stampFile();
    await settle(MOCKUP_WRITE_DELAY_MS * 4);
    const removed = roots();
    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(removed).toEqual([["B", undefined]]);
    expect(roots()).toEqual([
      ["A", STAMP],
      ["B", undefined],
    ]);
    expect(notices).toEqual([]);
  });
});
