/** @vitest-environment jsdom */
import { createApp, defineComponent, shallowRef, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCKUP_WRITE_DELAY_MS,
  useMockupSpec,
  type MockupSpecEditor,
  type MockupSpecNotice,
} from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import { mockupState } from "./helpers/mockup-runtime";

const ENDPOINT = "/api/mockup/demo/spec";
const TITLE = "/pages/0/tree/0";

function initialSpec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: [{ type: "KpiCard", options: { title: "Revenue" } }],
      },
    ],
  };
}

/** The backend's `spec.json`: its content, its digest, and the writes it took. */
class FakeSpecFile {
  spec = initialSpec();
  version = 1;
  refuse: { path: string; message: string } | undefined;
  readonly writes: Array<{ spec: MockupSpecDocument; digest?: string }> = [];

  get digest(): string {
    return `d${this.version}`;
  }

  writeFromOutside(spec: MockupSpecDocument): void {
    this.spec = spec;
    this.version += 1;
  }

  readonly fetch = vi.fn(
    async (
      url: string,
      init?: {
        method?: string;
        body?: { spec: MockupSpecDocument; digest?: string };
      },
    ) => {
      if (url !== ENDPOINT) throw new Error(`unexpected ${url}`);
      if (init?.method !== "PUT" || !init.body) {
        return { spec: structuredClone(this.spec), digest: this.digest };
      }
      this.writes.push(structuredClone(init.body));
      if (init.body.digest !== this.digest) {
        throw Object.assign(new Error("conflict"), { status: 409 });
      }
      if (this.refuse) return { ok: false, errors: [this.refuse] };
      this.spec = structuredClone(init.body.spec);
      this.version += 1;
      return { ok: true, digest: this.digest };
    },
  );
}

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
