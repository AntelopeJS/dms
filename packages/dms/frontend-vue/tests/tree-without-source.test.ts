// @vitest-environment jsdom
/**
 * A tree is configured after it is placed.
 *
 * The editor drops a block and the author points it at its data afterwards, so
 * a tree with neither a URL nor nodes of its own is a page under construction,
 * not a mistake. It used to throw during setup, which the canvas could only
 * report as a crash on the block the author had just placed.
 */
import * as vue from "vue";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { TreeProps } from "../layers/dms-ui/app/composables/tree/types";

// The layer's auto-imports, as the Nuxt build would supply them: Vue's own
// first, then the DMS helpers the composable reaches for.
for (const name of [
  "ref",
  "shallowRef",
  "computed",
  "watch",
  "watchEffect",
  "toValue",
  "nextTick",
] as const) {
  vi.stubGlobal(name, vue[name]);
}

vi.stubGlobal(
  "TreeEvents",
  new Proxy({}, { get: (_target, key) => String(key) }),
);
vi.stubGlobal("createError", (payload: unknown) => new Error(String(payload)));
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async () => [],
}));
vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: () => {} }));
vi.stubGlobal("useDefinedFunctions", () => ({ getFunction: () => undefined }));
vi.stubGlobal("useTranslation", () => ({ processI18n: (text: string) => text }));
vi.stubGlobal("useWatch", () => ({ isLoading: ref(false), state: ref({}) }));
vi.stubGlobal("useToast", () => ({ add: () => {} }));
vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
vi.stubGlobal("useEventedAction", () => ({ execute: async () => [] }));
vi.stubGlobal(
  "useDmsAsyncData",
  async (_key: string, handler: () => Promise<unknown>) => ({
    data: ref(await handler()),
    status: ref("success"),
    refresh: async () => {},
  }),
);

const { useTree } = await import(
  "../layers/dms-ui/app/composables/tree/useTree"
);

describe("a tree with no source yet", () => {
  const props = (extra: Partial<TreeProps> = {}) =>
    ({
      selectionBehavior: "toggle",
      componentId: "tree",
      pageId: "page",
      ...extra,
    }) as TreeProps;

  it("holds nothing, rather than refusing to render", async () => {
    const tree = await useTree(props());

    expect(tree.items.value).toEqual([]);
  });

  it("still reads the nodes it is given", async () => {
    const tree = await useTree(
      props({ staticNodes: [{ value: "one", label: "One" }] }),
    );

    expect(tree.items.value.map((node) => node.value)).toEqual(["one"]);
  });
});
