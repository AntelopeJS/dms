// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  nextTick,
  ref,
  shallowRef,
  type App,
  type Ref,
  type ShallowRef,
} from "vue";
import { useActiveElement } from "@vueuse/core";
import type { RowSelectionState } from "@tanstack/vue-table";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  TABLE_VIEW_SHORTCUTS_METADATA,
  buildTableViewShortcuts,
} from "../layers/dms-ui/app/composables/table-view/shortcuts";

let app: App;
let host: HTMLDivElement;
let globalFilter: ShallowRef<string | undefined>;
let rowSelect: Ref<RowSelectionState>;

function mountTableShortcuts() {
  const Harness = defineComponent({
    setup() {
      defineShortcuts(
        buildTableViewShortcuts({
          refresh: () => {},
          tableProps: computed(() => ({})),
          newRow: () => {},
          globalFilter,
          rowSelect,
          data: ref(null),
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
  globalFilter = shallowRef<string | undefined>(undefined);
  rowSelect = ref<RowSelectionState>({});
});

afterEach(() => {
  app.unmount();
  document.body.innerHTML = "";
});

describe("TableView Escape shortcut", () => {
  it("leaves Escape to overlays when there is nothing to clear", async () => {
    mountTableShortcuts();
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it("closes the search when a global filter is set", async () => {
    globalFilter.value = "acme";
    mountTableShortcuts();
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(true);
    expect(globalFilter.value).toBeUndefined();
  });

  it("clears the row selection when no search is open", async () => {
    rowSelect.value = { a: true, b: true };
    mountTableShortcuts();
    await nextTick();

    expect(pressEscape().defaultPrevented).toBe(true);
    expect(rowSelect.value).toEqual({});
  });

  it("closes the search before touching the selection", async () => {
    globalFilter.value = "";
    rowSelect.value = { a: true };
    mountTableShortcuts();
    await nextTick();

    pressEscape();
    expect(globalFilter.value).toBeUndefined();
    expect(rowSelect.value).toEqual({ a: true });
  });

  it("stops handling Escape once the filter is cleared", async () => {
    globalFilter.value = "acme";
    mountTableShortcuts();
    await nextTick();

    pressEscape();
    await nextTick();
    expect(pressEscape().defaultPrevented).toBe(false);
  });

  it("lets an open dialog take Escape even with a filter set", async () => {
    globalFilter.value = "acme";
    mountTableShortcuts();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    await nextTick();

    expect(pressEscape(button).defaultPrevented).toBe(false);
    expect(globalFilter.value).toBe("acme");
  });

  it("describes when the shortcut applies in the help list", () => {
    const escape = TABLE_VIEW_SHORTCUTS_METADATA.find((metadata) =>
      metadata.key.includes("$keyboard.escape"),
    );
    expect(escape?.condition?.descriptionKey).toBe(
      "$dms.shortcuts.tableview.escape.condition",
    );
  });
});
