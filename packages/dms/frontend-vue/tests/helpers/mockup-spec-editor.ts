import { createApp, defineComponent, shallowRef, type App } from "vue";
import { afterEach, beforeEach, vi } from "vitest";
import {
  useMockupSpec,
  type MockupSpecEditor,
  type MockupSpecNotice,
} from "../../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupSpecDocument } from "../../layers/dms-ui/app/entries/utils/mockupSpec";
import { fetchClient } from "../fixtures/fetchClient";
import { mockupState } from "./mockup-runtime";
import { FakeSpecFile } from "./mockup-spec-file";

/** The pointer of the one block of the initial spec. */
export const TITLE = "/pages/0/tree/0";

let file: FakeSpecFile;
let editor: MockupSpecEditor;
let notices: MockupSpecNotice[];

/** The `spec.json`, the editor and the notices of the test running. */
export const session = {
  get file() {
    return file;
  },
  get editor() {
    return editor;
  },
  get notices() {
    return notices;
  },
};

let app: App | undefined;
const state = shallowRef(mockupState());

export async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** What a test sets on the editor besides the file it reads: the viewer it writes as, and the block it holds. */
type EditorOptions = Partial<
  Pick<Parameters<typeof useMockupSpec>[0], "viewer" | "held">
>;

export async function mountEditor(extra: EditorOptions = {}): Promise<void> {
  const host = document.createElement("div");
  app = createApp(
    defineComponent({
      setup() {
        editor = useMockupSpec({
          name: "demo",
          authFetch: fetchClient(file.fetch),
          state,
          onNotice: (notice) => notices.push(notice),
          ...extra,
        });
        return () => null;
      },
    }),
  );
  app.mount(host);
  await settle();
}

export function retitle(title: string): void {
  editor.apply(
    { kind: "setOption", pointer: TITLE, key: "title", value: title },
    `${TITLE}:title`,
  );
}

export function titleOf(spec: MockupSpecDocument | undefined) {
  return spec?.pages[0]?.tree[0]?.options?.title;
}

export async function streamSaysTheFileChanged(): Promise<void> {
  state.value = mockupState({ revision: state.value.revision + 1 });
  await settle();
}

/** Gives each test a fresh `spec.json` and fake timers, and unmounts its editor after it. */
export function useSpecEditor(): void {
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
}
