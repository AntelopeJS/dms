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

export let file: FakeSpecFile;
export let editor: MockupSpecEditor;
export let notices: MockupSpecNotice[];

let app: App | undefined;
const state = shallowRef(mockupState());

export async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

export async function mountEditor(): Promise<void> {
  const host = document.createElement("div");
  app = createApp(
    defineComponent({
      setup() {
        editor = useMockupSpec({
          name: "demo",
          authFetch: fetchClient(file.fetch),
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

export function retitle(title: string): void {
  editor.apply(
    { kind: "setOption", pointer: TITLE, key: "title", value: title },
    `${TITLE}:title`,
  );
}

export function titleOf(spec: MockupSpecDocument | undefined): unknown {
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
