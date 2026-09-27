// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  nextTick,
  ref,
  type App,
  type Ref,
} from "vue";
import { useActiveElement } from "@vueuse/core";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  TREE_SHORTCUTS_METADATA,
  buildTreeShortcuts,
} from "../layers/dms-ui/app/composables/tree/shortcuts";
import type {
  TreeNode,
  TreeProps,
} from "../layers/dms-ui/app/composables/tree/types";

let app: App;
let host: HTMLDivElement;
let selected: Ref<TreeNode | TreeNode[] | undefined>;

const nodeA = { label: "A", value: "a" } as TreeNode;
const nodeB = { label: "B", value: "b" } as TreeNode;

function mountTreeShortcuts(multiple = false) {
  const Harness = defineComponent({
    setup() {
      defineShortcuts(
        buildTreeShortcuts({
          navigateTree: () => {},
          props: { multiple } as TreeProps,
          items: computed(() => [nodeA, nodeB]),
          selected,
          activeElement: useActiveElement(),
        }),
      );
      return () => null;
    },
  });
  app = createApp(Harness);
  app.mount(host);
}

function pressEscape(target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  selected = ref<TreeNode | TreeNode[] | undefined>(undefined);
});

afterEach(() => {
  app.unmount();
  document.body.innerHTML = "";
});

describe("Tree Escape shortcut", () => {
  it("leaves Escape to overlays when nothing is selected", async () => {
    mountTreeShortcuts();
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it("leaves Escape to overlays when a multiple selection is empty", async () => {
    selected.value = [];
    mountTreeShortcuts(true);
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it("deselects the node in single selection mode", async () => {
    selected.value = nodeA;
    mountTreeShortcuts();
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(true);
    expect(selected.value).toBeUndefined();
  });

  it("clears every node in multiple selection mode", async () => {
    selected.value = [nodeA, nodeB];
    mountTreeShortcuts(true);
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(true);
    expect(selected.value).toEqual([]);
  });

  it("stops handling Escape once the selection is cleared", async () => {
    selected.value = [nodeA];
    mountTreeShortcuts(true);
    await nextTick();

    pressEscape();
    await nextTick();
    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it("lets an open dialog take Escape even with a selection", async () => {
    selected.value = nodeA;
    mountTreeShortcuts();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    await nextTick();

    expect(pressEscape(button).defaultPrevented).toBe(false);
    expect(selected.value).toStrictEqual(nodeA);
  });

  it("describes when the shortcut applies in the help list", () => {
    const escape = TREE_SHORTCUTS_METADATA.find((metadata) =>
      metadata.key.includes("$keyboard.escape"),
    );
    expect(escape?.condition?.descriptionKey).toBe(
      "$dms.shortcuts.tree.escape.condition",
    );
  });
});
