// @vitest-environment jsdom
/**
 * A tree read a branch at a time.
 *
 * Its top level comes with the address each item's branch is read from, and the
 * items that branch answers can carry one of their own. Only an item marked as
 * opening shows it does: a branch whose items went unmarked looked like it held
 * nothing more, however deep the tree went.
 */
import * as vue from "vue";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type {
  TreeNode,
  TreeProps,
} from "../layers/dms-ui/app/composables/tree/types";

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

const ANSWERS: Record<string, TreeNode[]> = {
  "/tree": [
    {
      label: "Paid",
      value: "paid",
      hasChildren: true,
      lazyLoadUrl: "/tree?branch=paid",
    },
  ],
  "/tree?branch=paid": [
    {
      label: "September",
      value: "september",
      hasChildren: true,
      lazyLoadUrl: "/tree?branch=september",
    },
    { label: "Order 1", value: "order1" },
  ],
};

vi.stubGlobal(
  "TreeEvents",
  new Proxy({}, { get: (_target, key) => String(key) }),
);
vi.stubGlobal("Events", new Proxy({}, { get: (_target, key) => String(key) }));
vi.stubGlobal("createError", (payload: unknown) => new Error(String(payload)));
vi.stubGlobal("isUndefined", (value: unknown) => value === undefined);
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => ANSWERS[url] ?? [],
}));
vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: () => {} }));
vi.stubGlobal("useDefinedFunctions", () => ({ getFunction: () => undefined }));
vi.stubGlobal("useTranslation", () => ({
  processI18n: (text: string) => text,
}));
vi.stubGlobal("useWatch", () => ({ isLoading: ref(false), state: ref({}) }));
vi.stubGlobal("useToast", () => ({ add: () => {} }));
vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
vi.stubGlobal("useEventedAction", () => ({
  execute: async (run: () => Promise<unknown>) => run(),
}));
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

describe("a tree read a branch at a time", () => {
  it("marks the items of an opened branch that open in turn, and only them", async () => {
    const tree = await useTree({
      selectionBehavior: "toggle",
      componentId: "tree",
      pageId: "page",
      fetchUrl: "/tree",
      lazyLoad: true,
    } as TreeProps);
    const [paid] = tree.itemsRef.value;
    expect(paid?.trailingIcon, "the top level is marked").toBeTruthy();

    await paid?.onToggle?.(new Event("toggle"));

    const [september, order] = paid?.children ?? [];
    expect(september?.trailingIcon).toBe(paid?.trailingIcon);
    expect(order?.trailingIcon, "a row opens nothing").toBeUndefined();
  });
});
