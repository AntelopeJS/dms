/** @vitest-environment jsdom */
import { createApp, defineComponent, shallowRef, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCKUP_RETRY_DELAY_MS,
  MOCKUP_WRITE_DELAY_MS,
  useMockupSpec,
  type MockupSpecEditor,
  type MockupSpecNotice,
} from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import { mockupState } from "./helpers/mockup-runtime";
import { FakeSpecFile, initialSpec } from "./helpers/mockup-spec-file";

const TITLE = "/pages/0/tree/0";

let file: FakeSpecFile;
let app: App | undefined;
let editor: MockupSpecEditor;
let notices: MockupSpecNotice[];
const state = shallowRef(mockupState());

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

async function mountEditor(): Promise<void> {
  const host = document.createElement("div");
  app = createApp(
    defineComponent({
      setup() {
        editor = useMockupSpec({
          name: "demo",
          authFetch: file.fetch,
          state,
          onNotice: (notice) => notices.push(notice),
        });
        return () => null;
      },
    }),
  );
  app.mount(host);
  await settle();
}

function retitle(title: string): void {
  editor.apply(
    { kind: "setOption", pointer: TITLE, key: "title", value: title },
    `${TITLE}:title`,
  );
}

function titleOf(spec: MockupSpecDocument | undefined): unknown {
  return spec?.pages[0]?.tree[0]?.options?.title;
}

async function streamSaysTheFileChanged(): Promise<void> {
  state.value = mockupState({ revision: state.value.revision + 1 });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  file = new FakeSpecFile();
  notices = [];
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
});

describe("writing the spec", () => {
  it("writes one burst of typing once, the latest spec winning, with the digest it read (fails on a write per keystroke or a stale spec)", async () => {
    await mountEditor();
    for (const title of ["T", "Tu", "Turnover"]) retitle(title);
    await settle(MOCKUP_WRITE_DELAY_MS - 1);
    expect(file.writes).toEqual([]);
    await settle(1);
    expect(file.writes).toHaveLength(1);
    expect(file.writes[0]?.digest).toBe("d1");
    expect(titleOf(file.spec)).toBe("Turnover");
  });

  it("undoes and redoes to exactly the specs before and after, and writes each (fails when undo leaves the file behind)", async () => {
    await mountEditor();
    retitle("Turnover");
    await settle(MOCKUP_WRITE_DELAY_MS);
    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(file.spec).toEqual(initialSpec());
    expect(editor.canRedo.value).toBe(true);
    editor.redo();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Turnover");
    expect(file.writes.map((write) => write.digest)).toEqual([
      "d1",
      "d2",
      "d3",
    ]);
  });

  it("sends an edit made during a write after it, with the digest that write answered (fails on a 409 against its own write)", async () => {
    await mountEditor();
    let release: (() => void) | undefined;
    const slow = file.fetch.getMockImplementation();
    file.fetch.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => (release = resolve));
      return slow?.(url, init);
    });
    retitle("First");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Second");
    await settle(MOCKUP_WRITE_DELAY_MS);
    release?.();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(
      file.writes.map((write) => [write.digest, titleOf(write.spec)]),
    ).toEqual([
      ["d1", "First"],
      ["d2", "Second"],
    ]);
    expect(notices).toEqual([]);
  });
});

describe("another writer", () => {
  it("takes the file another writer changed, starts its history over and says so (fails when the edit page keeps a stale spec)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    const theirs = initialSpec();
    theirs.title = "From the AI";
    file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    expect(editor.spec.value).toEqual(theirs);
    expect(editor.canUndo.value).toBe(false);
    expect(notices).toEqual([{ kind: "adopted" }]);
  });

  it("says nothing when the stream only reports its own write (fails on a toast per edit)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();
    expect(notices).toEqual([]);
    expect(editor.canUndo.value).toBe(true);
  });

  it("never writes over a file changed since it read it: a 409 takes the file instead (fails when the AI's write is overwritten)", async () => {
    await mountEditor();
    const theirs = initialSpec();
    theirs.title = "From the AI";
    file.writeFromOutside(theirs);
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(file.spec).toEqual(theirs);
    expect(editor.spec.value).toEqual(theirs);
    expect(notices).toEqual([{ kind: "adopted" }]);
  });
});

describe("an id a note stamped on the file", () => {
  const STAMP = "b-k3j9x0qz";

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

  it("counts a file that adds an id and changes anything else as another writer's change (fails when any added id passes for a stamp)", async () => {
    await mountEditor();

    file.writeFromOutside({ ...stamped(file.spec), title: "From the AI" });
    await streamSaysTheFileChanged();

    expect(notices).toEqual([{ kind: "adopted" }]);
  });

  it("gives an undone step the id where exactly one node without an id equals the stamped one, and none to twins (fails when an undo writes the block without its id, or puts it on a twin)", async () => {
    const kpi = (title: string) => ({ type: "KpiCard", options: { title } });
    file.spec = {
      version: 1,
      pages: [
        { id: "orders", title: "Orders", tree: [kpi("A"), kpi("B"), kpi("B")] },
      ],
    };
    await mountEditor();
    editor.apply({
      kind: "insertNode",
      parent: null,
      page: "orders",
      index: 0,
      node: { type: "Banner" },
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    const ids = new Map([
      [1, "b-aaaaaaaa"],
      [2, STAMP],
    ]);
    file.writeFromOutside(stamped(file.spec, ids));
    await streamSaysTheFileChanged();

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(file.spec.pages[0]?.tree.map((node) => node.id)).toEqual([
      "b-aaaaaaaa",
      undefined,
      undefined,
    ]);
    expect(notices).toEqual([]);
  });

  it("keeps the history and says nothing, and the spec shown takes the id (fails when a stamp counts as another writer's change)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);

    file.writeFromOutside(stamped(file.spec));
    await streamSaysTheFileChanged();

    expect(editor.canUndo.value).toBe(true);
    expect(notices).toEqual([]);
    expect(editor.spec.value).toEqual(file.spec);
    expect(file.spec.pages[0]?.tree[0]?.id).toBe(STAMP);
  });

  it("writes an edit typed after the stamp over the stamped file, keeping the id (fails when the conflict drops the edit or the id)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);

    file.writeFromOutside(stamped(file.spec));
    retitle("Mine, again");
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(titleOf(file.spec)).toBe("Mine, again");
    expect(file.spec.pages[0]?.tree[0]?.id).toBe(STAMP);
    expect(editor.spec.value).toEqual(file.spec);
    expect(editor.canUndo.value).toBe(true);
    expect(notices).toEqual([]);
  });
});

describe("a refused write", () => {
  it("shows the first error and goes back to the spec it last wrote (fails when the refused spec stays on screen)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.refuse = {
      path: "/pages/0/tree/0/options/title",
      message: "Required",
    };
    retitle("Bad");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(notices).toEqual([
      {
        kind: "refused",
        issue: { path: "/pages/0/tree/0/options/title", message: "Required" },
        discarded: false,
      },
    ]);
    expect(titleOf(editor.spec.value)).toBe("Good");
    expect(titleOf(file.spec)).toBe("Good");
    await settle(MOCKUP_WRITE_DELAY_MS * 4);
    expect(file.writes).toHaveLength(2);
  });

  it("leaves no undo step that changes nothing: the next undo goes to the spec before the last written one (fails when the history keeps the refused edit's step)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.refuse = { path: "/pages/0/tree/0/options/x", message: "Bad" };
    editor.apply({
      kind: "setOption",
      pointer: TITLE,
      key: "x",
      value: "y",
    });
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.refuse = undefined;

    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    expect(editor.spec.value).toEqual(initialSpec());
    expect(file.spec).toEqual(initialSpec());
    expect(editor.canUndo.value).toBe(false);
  });

  it("drops the edits typed while the refused write was in flight and says so (fails when they vanish without a word or are written over the refused spec)", async () => {
    await mountEditor();
    retitle("Good");
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.refuse = { path: "/pages/0/tree/0/options/x", message: "Bad" };
    let release: (() => void) | undefined;
    const real = file.fetch.getMockImplementation();
    file.fetch.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => (release = resolve));
      return real?.(url, init);
    });
    editor.apply({ kind: "setOption", pointer: TITLE, key: "x", value: "y" });
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Typed meanwhile");
    release?.();
    await settle(MOCKUP_WRITE_DELAY_MS * 4);

    expect(titleOf(editor.spec.value)).toBe("Good");
    expect(editor.spec.value?.pages[0]?.tree[0]?.options).not.toHaveProperty(
      "x",
    );
    expect(notices).toEqual([
      {
        kind: "refused",
        issue: { path: "/pages/0/tree/0/options/x", message: "Bad" },
        discarded: true,
      },
    ]);
    expect(file.writes).toHaveLength(2);
  });
});

describe("a write that fails", () => {
  it("is retried after a short backoff until it lands, the notice staying until then (fails when a 500 leaves the edit unwritten)", async () => {
    await mountEditor();
    file.failures = 2;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Revenue");
    expect(editor.hasFailed.value).toBe(true);
    await settle(10_000);
    expect(titleOf(file.spec)).toBe("Mine");
    expect(editor.hasFailed.value).toBe(false);
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("is retried at the next stream state, without waiting for the backoff (fails when only a timer retries)", async () => {
    await mountEditor();
    file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Revenue");
    await streamSaysTheFileChanged();
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Mine");
  });

  it("is retried with the next edit, which it carries (fails when the new edit waits behind the failed one)", async () => {
    await mountEditor();
    file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("Mine, again");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Mine, again");
    expect(editor.hasFailed.value).toBe(false);
  });

  it("gives way to a file another writer changed meanwhile, and the notice goes (fails when the retry overwrites the AI)", async () => {
    await mountEditor();
    file.failures = 1;
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    const theirs = initialSpec();
    theirs.title = "From the AI";
    file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    await settle(10_000);
    expect(file.spec).toEqual(theirs);
    expect(editor.spec.value).toEqual(theirs);
    expect(editor.hasFailed.value).toBe(false);
  });
});

describe("a write whose answer was lost", () => {
  it("counts as landed when the retry finds the file holding it, keeping the history (fails when the editor adopts its own write and wipes undo)", async () => {
    file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);

    await settle(MOCKUP_RETRY_DELAY_MS);

    expect(titleOf(file.spec)).toBe("A");
    expect(editor.canUndo.value).toBe(true);
    expect(editor.hasFailed.value).toBe(false);
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("then writes the edit typed before the retry (fails when that edit is dropped)", async () => {
    file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);
    retitle("AB");

    await settle(MOCKUP_RETRY_DELAY_MS * 4);

    expect(titleOf(file.spec)).toBe("AB");
    expect(titleOf(editor.spec.value)).toBe("AB");
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("several writes whose answers were lost", () => {
  it("counts the file as its own write when it holds any of them, then writes the spec shown (fails when only the last one sent is remembered)", async () => {
    file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);
    file.failures = 1;
    retitle("AB");

    await settle(MOCKUP_RETRY_DELAY_MS * 8);

    expect(titleOf(file.spec)).toBe("AB");
    expect(editor.canUndo.value).toBe(true);
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });

  it("writes the spec an undo went back to, even when it matches the last answered write (fails when the file keeps the undone edit)", async () => {
    file.lostAnswers = 1;
    await mountEditor();
    retitle("A");
    await settle(MOCKUP_WRITE_DELAY_MS);

    editor.undo();
    await settle(MOCKUP_RETRY_DELAY_MS * 4);

    expect(titleOf(file.spec)).toBe("Revenue");
    expect(titleOf(editor.spec.value)).toBe("Revenue");
    expect(editor.hasFailed.value).toBe(false);
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("a conflict whose file cannot be read", () => {
  it("backs off like any failed write instead of writing again at once (fails on a write every few milliseconds)", async () => {
    await mountEditor();
    file.writeFromOutside(initialSpec());
    file.readFailures = Number.POSITIVE_INFINITY;
    retitle("Mine");

    await settle(5000);

    expect(file.writes.length).toBeLessThanOrEqual(5);
    expect(editor.hasFailed.value).toBe(true);
    expect(notices.map((notice) => notice.kind)).toEqual(["failed"]);
  });
});

describe("the notice of a failed write", () => {
  it("goes once the spec an undo went back to is confirmed, when the server answers again (fails when the retry banner outlives every pending edit)", async () => {
    file.failures = Number.POSITIVE_INFINITY;
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(editor.hasFailed.value).toBe(true);
    editor.undo();
    await settle(MOCKUP_WRITE_DELAY_MS);

    file.failures = 0;
    await settle(MOCKUP_RETRY_DELAY_MS * 16);

    expect(titleOf(file.spec)).toBe("Revenue");
    expect(editor.hasFailed.value).toBe(false);
  });
});

describe("a write that landed", () => {
  it("stays pending until the stream sends a state after it (fails when the old compiled paths count as the new spec's)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(titleOf(file.spec)).toBe("Mine");
    expect(editor.isPending.value).toBe(true);

    await streamSaysTheFileChanged();

    expect(editor.isPending.value).toBe(false);
  });

  it("is not pending when the stream sent its state before the write's answer came (fails when clicks stay ignored until the next edit)", async () => {
    let release = (): void => undefined;
    file.answerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();

    release();
    await settle(MOCKUP_RETRY_DELAY_MS);

    expect(titleOf(file.spec)).toBe("Mine");
    expect(editor.isPending.value).toBe(false);
  });
});

describe("adopting a change from outside", () => {
  it("reports the spec it dropped and the one it took, for a stream state and for a 409, and not for its own write (fails when an editing session cannot tell)", async () => {
    await mountEditor();
    retitle("Mine");
    await settle(MOCKUP_WRITE_DELAY_MS);
    await streamSaysTheFileChanged();
    expect(editor.adoption.value).toBeUndefined();

    const theirs = initialSpec();
    theirs.title = "From the AI";
    file.writeFromOutside(theirs);
    await streamSaysTheFileChanged();
    expect(titleOf(editor.adoption.value?.previous)).toBe("Mine");
    expect(editor.adoption.value?.next).toEqual(theirs);

    const first = editor.adoption.value;
    const later = initialSpec();
    later.title = "Again";
    file.writeFromOutside(later);
    retitle("Conflicting");
    await settle(MOCKUP_WRITE_DELAY_MS);
    expect(editor.adoption.value).not.toBe(first);
    expect(editor.adoption.value?.next).toEqual(later);
  });
});
