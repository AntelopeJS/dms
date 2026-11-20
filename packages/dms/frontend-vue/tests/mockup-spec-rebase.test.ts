/** @vitest-environment jsdom */
import { shallowRef } from "vue";
import { describe, expect, it } from "vitest";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  TITLE,
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

const SECOND = "/pages/0/tree/1";

function twoBlocks(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [
          { id: "b-revenue", type: "KpiCard", options: { title: "Revenue" } },
          { id: "b-orders1", type: "KpiCard", options: { title: "Orders" } },
        ],
      },
    ],
  };
}

function titles(spec: MockupSpecDocument | undefined) {
  return spec?.pages[0]?.tree.map((node) => node.options?.title);
}

function theirs(title: string): MockupSpecDocument {
  const written = twoBlocks();
  const second = written.pages[0]?.tree[1];
  if (second?.options) second.options.title = title;
  return written;
}

describe("a write from outside while the editor holds a block", () => {
  it("keeps an edit made inside the held block and writes it on top of the other writer's file (fails when the edit is discarded with the adopted file)", async () => {
    file.spec = twoBlocks();
    await mountEditor({ held: shallowRef(TITLE) });
    retitle("Mine");
    file.writeFromOutside(theirs("Theirs"));

    await settle(MOCKUP_WRITE_DELAY_MS * 3);

    expect(titles(file.spec)).toEqual(["Mine", "Theirs"]);
    expect(titles(editor.spec.value)).toEqual(["Mine", "Theirs"]);
    expect(notices).toEqual([{ kind: "adopted" }]);
  });

  it("takes the other writer's file and drops an edit made outside the held block (fails when every unwritten edit is kept)", async () => {
    file.spec = twoBlocks();
    await mountEditor({ held: shallowRef(TITLE) });
    editor.apply({
      kind: "setOption",
      pointer: SECOND,
      key: "title",
      value: "Mine",
    });
    file.writeFromOutside(theirs("Theirs"));

    await settle(MOCKUP_WRITE_DELAY_MS * 3);

    expect(titles(file.spec)).toEqual(["Revenue", "Theirs"]);
    expect(titles(editor.spec.value)).toEqual(["Revenue", "Theirs"]);
  });

  it("takes the other writer's file when the session holds no block (fails when an edit is kept without a lock)", async () => {
    file.spec = twoBlocks();
    await mountEditor({ held: shallowRef(undefined) });
    retitle("Mine");
    file.writeFromOutside(theirs("Theirs"));

    await settle(MOCKUP_WRITE_DELAY_MS * 3);

    expect(titles(file.spec)).toEqual(["Revenue", "Theirs"]);
  });

  it("keeps the edit when the stream reports the file before the edit is written, undo then going back to the other writer's file (fails when the history keeps steps the other file does not have)", async () => {
    file.spec = twoBlocks();
    await mountEditor({ held: shallowRef(TITLE) });
    file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.writeFromOutside(theirs("Theirs"));

    await streamSaysTheFileChanged();
    await settle(MOCKUP_WRITE_DELAY_MS * 3);
    expect(titles(file.spec)).toEqual(["Mine", "Theirs"]);
    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(titles(file.spec)).toEqual(["Revenue", "Theirs"]);
  });
});

describe("a write from outside that stamps an id inside the held block", () => {
  const GRID = "/pages/0/tree/0";
  const CELL = `${GRID}/children/0`;

  function nested(): MockupSpecDocument {
    return {
      version: 1,
      pages: [
        {
          id: "orders",
          title: "Orders",
          tree: [
            {
              id: "b-grid0001",
              type: "Grid",
              children: [
                { type: "KpiCard", options: { title: "Revenue" } },
                { type: "KpiCard", options: { title: "Margin" } },
              ],
            },
            { id: "b-orders1", type: "KpiCard", options: { title: "Orders" } },
          ],
        },
      ],
    };
  }

  it("writes the held block's edit with the id a note pinned on its child, when that comes in the same read as another change (fails when the rebase puts the held block back without the stamp)", async () => {
    file.spec = nested();
    await mountEditor({ held: shallowRef(GRID) });
    editor.apply({
      kind: "setOption",
      pointer: CELL,
      key: "title",
      value: "Mine",
    });
    const theirs = nested();
    const [grid, orders] = theirs.pages[0]?.tree ?? [];
    const [cell] = grid?.children ?? [];
    if (!cell || !orders?.options) throw new Error("the spec has no cell");
    cell.id = "b-cell0001";
    orders.options.title = "Theirs";
    file.writeFromOutside(theirs);

    await settle(MOCKUP_WRITE_DELAY_MS * 3);

    const written = file.spec.pages[0]?.tree[0]?.children?.[0];
    expect(written?.options?.title).toBe("Mine");
    expect(written?.id).toBe("b-cell0001");
    expect(file.spec.pages[0]?.tree[1]?.options?.title).toBe("Theirs");
  });
});

describe("what a write from outside says", () => {
  it("names the viewer of an editor that wrote the file, which the toast then leaves out (fails when the notice carries no author)", async () => {
    await mountEditor();
    const other = twoBlocks();
    other.title = "From Bea";
    file.writeFromOutside(other, { name: "Bea" });

    await streamSaysTheFileChanged();

    expect(notices).toEqual([{ kind: "adopted", by: "Bea" }]);
  });

  it("names no one for a file the AI wrote (fails when every adoption is attributed)", async () => {
    await mountEditor();
    const other = twoBlocks();
    other.title = "From the AI";
    file.writeFromOutside(other);

    await streamSaysTheFileChanged();

    expect(notices).toEqual([{ kind: "adopted" }]);
  });

  it("writes as its own viewer, and as none when it has none (fails when the viewer id is left off a write)", async () => {
    await mountEditor({ viewer: "v-me" });
    retitle("Mine");

    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(file.writes.map((write) => write.viewer)).toEqual(["v-me"]);
  });
});
