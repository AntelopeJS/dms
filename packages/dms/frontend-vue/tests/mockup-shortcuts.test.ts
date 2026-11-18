/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import uiEn from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";
import { MOCKUP_WRITE_DELAY_MS } from "../layers/dms-ui/app/entries/composables/block-preview/useMockupSpec";
import type { MockupBlockType } from "../layers/dms-ui/app/entries/utils/mockupCatalog";
import {
  MOCKUP_SHORTCUTS,
  MOCKUP_SHORTCUT_GROUPS,
  matchShortcuts,
  type MockupShortcutId,
  type MockupView,
} from "../layers/dms-ui/app/entries/utils/mockupShortcuts";
import type { MockupSpecDocument } from "../layers/dms-ui/app/entries/utils/mockupSpec";
import {
  flush,
  mockupPage,
  mockupState,
  mountViewer,
  stubMockupRuntime,
  type MockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const KPI: MockupBlockType = {
  type: "KpiCard",
  componentName: "dms-kpi-card",
  meta: { name: "KPI card", group: "visualization" },
  config: {
    title: { type: "string", ui: { label: "Title", group: "content" } },
  },
  defaults: {},
};

function spec(): MockupSpecDocument {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        tree: ["a", "b", "c"].map((id) => ({
          id,
          type: "KpiCard",
          options: { title: id },
        })),
      },
    ],
  };
}

const PATHS = {
  "block-0": "/pages/0/tree/0",
  "block-1": "/pages/0/tree/1",
  "block-2": "/pages/0/tree/2",
};
const STATE = mockupState({
  pages: [mockupPage({ options: {}, tree: [], paths: PATHS })],
});
const RECTS = Object.keys(PATHS).map((path, index) => ({
  path,
  rect: { x: 0, y: 40 + index * 120, width: 400, height: 100 },
}));

let runtime: MockupRuntime;
let viewer: MountedViewer;

const find = (selector: string) =>
  viewer.host.querySelector<HTMLElement>(selector);
const ids = () => runtime.file.spec.pages[0]?.tree.map((node) => node.id);
const selectedTop = () => find("[data-dms-mockup-selection]")?.style.top;

async function saved(): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, MOCKUP_WRITE_DELAY_MS + 50),
  );
  await flush();
  await viewer.publish(
    "state",
    mockupState({
      revision: runtime.file.version,
      pages: [
        mockupPage({
          options: {},
          tree: [],
          paths: Object.fromEntries(
            (runtime.file.spec.pages[0]?.tree ?? []).map((_node, index) => [
              `block-${index}`,
              `/pages/0/tree/${index}`,
            ]),
          ),
        }),
      ],
    }),
  );
  await viewer.say({
    type: "layout",
    blocks: (runtime.file.spec.pages[0]?.tree ?? []).map((_node, index) => ({
      path: `block-${index}`,
      rect: { x: 0, y: 40 + index * 120, width: 400, height: 100 },
    })),
  });
}

/** Presses a key on `target` and answers whether the page's own action was held back. */
async function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): Promise<boolean> {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  await flush();
  return event.defaultPrevented;
}

async function pick(path: string): Promise<void> {
  await viewer.say({ type: "select", path });
  await viewer.say({ type: "layout", blocks: RECTS });
}

beforeEach(async () => {
  runtime = stubMockupRuntime({ spec: spec(), blocks: [KPI] });
  viewer = await mountViewer();
  await viewer.publish("state", STATE);
  await viewer.say({ type: "ready" });
  await viewer.say({ type: "layout", blocks: RECTS });
});

afterEach(() => {
  viewer.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("block shortcuts", () => {
  it("moves the selected block up and down with Alt+arrows, within its parent (fails when the shortcut does nothing or leaves the list)", async () => {
    await pick("block-1");
    expect(await press("ArrowUp", { altKey: true })).toBe(true);
    await saved();
    expect(ids()).toEqual(["b", "a", "c"]);

    expect(await press("ArrowUp", { altKey: true })).toBe(true);
    await saved();
    expect(ids()).toEqual(["b", "a", "c"]);

    await press("ArrowDown", { altKey: true });
    await saved();
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("duplicates with Ctrl+D and holds back the browser's bookmark (fails when the default is not prevented)", async () => {
    await pick("block-0");
    expect(await press("d", { ctrlKey: true })).toBe(true);
    await saved();
    expect(ids()).toEqual(["a", "a-2", "b", "c"]);
  });

  it("duplicates with Cmd+D too", async () => {
    await pick("block-2");
    expect(await press("d", { metaKey: true })).toBe(true);
    await saved();
    expect(ids()).toEqual(["a", "b", "c", "c-2"]);
  });

  it("deletes with Delete and with Backspace", async () => {
    await pick("block-0");
    await press("Delete");
    await saved();
    expect(ids()).toEqual(["b", "c"]);

    await pick("block-0");
    await press("Backspace");
    await saved();
    expect(ids()).toEqual(["c"]);
  });

  it("selects the previous and next sibling with the arrows, and stops at either end (fails when it wraps)", async () => {
    await pick("block-1");
    expect(selectedTop()).toBe("160px");

    expect(await press("ArrowUp")).toBe(true);
    expect(selectedTop()).toBe("40px");
    await press("ArrowUp");
    expect(selectedTop()).toBe("40px");

    await press("ArrowDown");
    await press("ArrowDown");
    expect(selectedTop()).toBe("280px");
    await press("ArrowDown");
    expect(selectedTop()).toBe("280px");
  });

  it("leaves every one of these keys to the browser when no block is selected", async () => {
    const version = runtime.file.version;
    expect(await press("ArrowDown")).toBe(false);
    expect(await press("ArrowUp", { altKey: true })).toBe(false);
    expect(await press("d", { ctrlKey: true })).toBe(false);
    expect(await press("Delete")).toBe(false);
    await saved();
    expect(runtime.file.version).toBe(version);
  });

  it("ignores them while typing in a field (fails when Delete removes the block under the caret's text)", async () => {
    await pick("block-0");
    const field = document.createElement("input");
    document.body.append(field);
    const version = runtime.file.version;

    await press("Delete", {}, field);
    await press("d", { ctrlKey: true }, field);
    await press("ArrowDown", { altKey: true }, field);
    await press("ArrowDown", {}, field);
    field.remove();
    await saved();

    expect(runtime.file.version).toBe(version);
    expect(selectedTop()).toBe("40px");
  });

  it("ignores them inside inline text being edited", async () => {
    await pick("block-0");
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    const version = runtime.file.version;

    await press("Delete", {}, editable);
    editable.remove();
    await saved();

    expect(runtime.file.version).toBe(version);
  });
});

/** The shortcuts a key fires in `view`, in the order they try to take it. */
function fired(
  view: MockupView,
  key: string,
  init: KeyboardEventInit = {},
): MockupShortcutId[] {
  return matchShortcuts(new KeyboardEvent("keydown", { key, ...init }), view);
}

describe("the shortcuts table", () => {
  const onPage = (key: string, init: KeyboardEventInit = {}) =>
    fired("current", key, init);

  it("maps each key combination to its shortcut, and Escape to stepping back before closing the page (fails when Escape closes the page before it clears the selection)", () => {
    expect({
      "[": onPage("["),
      "]": onPage("]"),
      "?": onPage("?", { shiftKey: true }),
      up: onPage("ArrowUp"),
      down: onPage("ArrowDown"),
      altUp: onPage("ArrowUp", { altKey: true }),
      altDown: onPage("ArrowDown", { altKey: true }),
      duplicate: onPage("d", { ctrlKey: true }),
      delete: onPage("Delete"),
      backspace: onPage("Backspace"),
      enter: onPage("Enter"),
      escape: onPage("Escape"),
      comment: onPage("C"),
      undo: onPage("z", { ctrlKey: true }),
      redo: onPage("z", { ctrlKey: true, shiftKey: true }),
      redoY: onPage("y", { metaKey: true }),
    }).toEqual({
      "[": ["left_panel"],
      "]": ["right_panel"],
      "?": ["shortcuts"],
      up: ["select_previous"],
      down: ["select_next"],
      altUp: ["move_up"],
      altDown: ["move_down"],
      duplicate: ["duplicate"],
      delete: ["remove"],
      backspace: ["remove"],
      enter: ["insert_placed"],
      escape: ["cancel", "close_page"],
      comment: ["comment"],
      undo: ["undo"],
      redo: ["redo"],
      redoY: ["redo"],
    });
  });

  it("keeps the panel keys working where a layout types them with AltGr, and drops a plain letter pressed with Ctrl", () => {
    expect(onPage("[", { ctrlKey: true, altKey: true })).toEqual([
      "left_panel",
    ]);
    expect(onPage("c", { ctrlKey: true })).toEqual([]);
    expect(onPage("d")).toEqual([]);
    expect(onPage("ArrowUp", { ctrlKey: true })).toEqual([]);
  });

  it("fires only the panel keys, the sheet and Escape while a past version is previewed (fails when an editing key reaches a read-only preview)", () => {
    const inVersion = (key: string, init: KeyboardEventInit = {}) =>
      fired("version", key, init);
    expect(inVersion("Escape")).toEqual(["back_to_current"]);
    expect(inVersion("[")).toEqual(["left_panel"]);
    expect(inVersion("]")).toEqual(["right_panel"]);
    expect(inVersion("?", { shiftKey: true })).toEqual(["shortcuts"]);
    for (const key of ["Delete", "c"]) {
      expect(inVersion(key), key).toEqual([]);
    }
    expect(inVersion("z", { ctrlKey: true })).toEqual([]);
    expect(inVersion("d", { ctrlKey: true })).toEqual([]);
  });

  it("leaves Escape to an open menu, popover or dialog (fails when Escape closes the page under an open menu)", () => {
    const layer = document.createElement("div");
    layer.setAttribute("data-dismissable-layer", "");
    document.body.append(layer);
    try {
      expect(onPage("Escape")).toEqual([]);
      expect(fired("overview", "Escape")).toEqual([]);
      expect(onPage("Delete")).toEqual(["remove"]);
    } finally {
      layer.remove();
    }
    expect(onPage("Escape")).toEqual(["cancel", "close_page"]);
  });

  it("holds a text in each locale for every shortcut and group", () => {
    for (const [locale, texts] of Object.entries({ en: uiEn, fr: uiFr })) {
      for (const id of Object.keys(MOCKUP_SHORTCUTS)) {
        expect(texts.dms.mockup, `${locale} ${id}`).toHaveProperty(
          `shortcut_${id}`,
          expect.any(String),
        );
      }
      for (const group of MOCKUP_SHORTCUT_GROUPS) {
        expect(texts.dms.mockup, `${locale} ${group}`).toHaveProperty(
          `shortcut_group_${group}`,
          expect.any(String),
        );
      }
    }
  });
});

describe("the overview's shortcuts", () => {
  it("fires the Overview's keys in the Overview alone, and none of the editing keys there (fails when an editing key reaches the Overview)", () => {
    for (const view of ["overview", "overview_version"] as const) {
      expect(fired(view, "!", { code: "Digit1", shiftKey: true })).toEqual([
        "fit_all",
      ]);
      expect(fired(view, "?", { shiftKey: true })).toEqual(["shortcuts"]);
      for (const key of ["Delete", "ArrowUp", "Enter", "["]) {
        expect(fired(view, key), `${view} ${key}`).toEqual([]);
      }
      expect(fired(view, "d", { ctrlKey: true })).toEqual([]);
      expect(fired(view, "z", { ctrlKey: true })).toEqual([]);
    }
    expect(fired("overview", "c")).toEqual(["comment"]);
    expect(fired("overview_version", "c")).toEqual([]);
    expect(fired("current", "!", { code: "Digit1", shiftKey: true })).toEqual(
      [],
    );
  });

  it("has no key to open or close the Overview, the mockup's home: O fires nothing, and Escape there only steps back from a comment, or from a previewed version (fails when O or Escape still toggles it)", () => {
    for (const view of [
      "current",
      "version",
      "overview",
      "overview_version",
      "preview",
    ] as const) {
      expect(fired(view, "o"), view).toEqual([]);
    }
    expect(fired("overview", "Escape")).toEqual(["cancel"]);
    expect(fired("overview_version", "Escape")).toEqual(["back_to_current"]);
    expect(fired("preview", "Escape")).toEqual(["close_preview"]);
  });

  it("fits every page on Shift and the 1 key, whatever the layout types (fails when Shift+1 is read as the `!` a US keyboard types, or a French one's `1` is missed)", () => {
    const fit = (key: string) =>
      fired("overview", key, { code: "Digit1", shiftKey: true });
    expect(fit("!")).toEqual(["fit_all"]);
    expect(fit("1")).toEqual(["fit_all"]);
    expect(fired("overview", "1", { code: "Digit1" })).toEqual([]);
  });
});

describe("the shortcuts sheet", () => {
  const rows = () =>
    [...viewer.host.querySelectorAll("[data-dms-mockup-shortcut]")].map((row) =>
      row.getAttribute("data-dms-mockup-shortcut"),
    );

  it("opens on ? and lists every shortcut of the table, grouped (fails when a shortcut is missing from the sheet)", async () => {
    expect(find("[data-dms-mockup-shortcuts]")).toBeNull();
    expect(await press("?", { shiftKey: true })).toBe(true);

    expect(find("[data-dms-mockup-shortcuts]")).not.toBeNull();
    expect(rows()).toEqual(
      MOCKUP_SHORTCUT_GROUPS.flatMap((group) =>
        Object.entries(MOCKUP_SHORTCUTS)
          .filter(([, shortcut]) => shortcut.group === group)
          .map(([id]) => id),
      ),
    );
    expect(
      [...viewer.host.querySelectorAll("[data-dms-mockup-shortcut-group]")].map(
        (section) => section.getAttribute("data-dms-mockup-shortcut-group"),
      ),
    ).toEqual([
      "panels",
      "editing",
      "comments",
      "history",
      "overview",
      "preview",
    ]);
  });

  it("opens from the keyboard button of the top bar", async () => {
    find("[data-dms-mockup-shortcuts-open]")?.click();
    await flush();
    expect(find("[data-dms-mockup-shortcuts]")).not.toBeNull();
  });

  it("prints Ctrl and Alt, and ⌘ and ⌥ on a Mac", async () => {
    await press("?", { shiftKey: true });
    const keys = (id: string) =>
      [
        ...(find(`[data-dms-mockup-shortcut=${id}]`)?.querySelectorAll("kbd") ??
          []),
      ].map((key) => key.textContent);
    expect(keys("duplicate")).toEqual(["Ctrl", "D"]);
    expect(keys("move_up")).toEqual(["Alt", "↑"]);
    expect(keys("redo")).toEqual(["Ctrl", "Shift", "Z", "Ctrl", "Y"]);
    viewer.unmount();

    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    stubMockupRuntime({ spec: spec(), blocks: [KPI] });
    viewer = await mountViewer();
    await press("?", { shiftKey: true });
    expect(keys("duplicate")).toEqual(["⌘", "D"]);
    expect(keys("move_up")).toEqual(["⌥", "↑"]);
    expect(keys("remove")).toEqual(["⌫", "Backspace"]);
  });
});

describe("tooltips with the keys", () => {
  function kbdsOf(tip: Element | null | undefined): string[] {
    const parsed: unknown = JSON.parse(
      tip?.getAttribute("data-tooltip-kbds") ?? "[]",
    );
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }

  const tips = () =>
    new Map(
      [...viewer.host.querySelectorAll("[data-tooltip]")].map((tip) => [
        tip.firstElementChild?.getAttribute("aria-label"),
        kbdsOf(tip),
      ]),
    );

  it("shows the key of each top bar button as badges (fails when a button has a tooltip without its key)", () => {
    const shown = tips();
    expect(shown.get("dms.mockup.edit_panel")).toEqual(["["]);
    expect(shown.get("dms.mockup.inspector")).toEqual(["]"]);
    expect(shown.get("dms.mockup.undo")).toEqual(["Ctrl", "Z"]);
    expect(shown.get("dms.mockup.redo")).toEqual(["Ctrl", "Shift", "Z"]);
    expect(shown.get("dms.mockup.shortcuts_title")).toEqual(["?"]);
    expect(
      viewer.host
        .querySelector("[data-dms-mockup-comment]")
        ?.closest("[data-tooltip]")
        ?.getAttribute("data-tooltip-kbds"),
    ).toBe('["C"]');
  });

  it("gives every top bar button a tooltip, with no badge where it has no shortcut", () => {
    const buttons = [
      ...viewer.host.querySelectorAll(
        "[data-dms-mockup-topbar] button:not([data-dms-mockup-title-edit])",
      ),
    ];
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) {
      expect(button.closest("[data-tooltip]"), button.outerHTML).not.toBeNull();
    }
    const back = viewer.host
      .querySelector("[data-dms-mockup-back]")
      ?.closest("[data-tooltip]");
    expect(back?.getAttribute("data-tooltip")).toBe("dms.mockup.back_hint");
    expect(back?.getAttribute("data-tooltip-kbds")).toBe("[]");
  });

  it("shows the key of each action of the block toolbar (fails when the toolbar has no hint)", async () => {
    await pick("block-0");
    const keysOf = (selector: string) =>
      kbdsOf(find(selector)?.closest("[data-tooltip]"));
    expect(keysOf("[data-dms-mockup-move-up]")).toEqual(["Alt", "↑"]);
    expect(keysOf("[data-dms-mockup-move-down]")).toEqual(["Alt", "↓"]);
    expect(keysOf("[data-dms-mockup-duplicate]")).toEqual(["Ctrl", "D"]);
    expect(keysOf("[data-dms-mockup-remove]")).toEqual(["Delete"]);
    expect(keysOf("[data-dms-mockup-drag-handle]")).toEqual([]);
  });

  it("prints ⌘ and ⌥ on a Mac", async () => {
    viewer.unmount();
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("MacIntel");
    runtime = stubMockupRuntime({ spec: spec(), blocks: [KPI] });
    viewer = await mountViewer();
    await viewer.publish("state", STATE);
    await viewer.say({ type: "ready" });
    await pick("block-0");

    const toolbar = (selector: string) =>
      find(selector)
        ?.closest("[data-tooltip]")
        ?.getAttribute("data-tooltip-kbds");
    expect(toolbar("[data-dms-mockup-move-up]")).toBe('["⌥","↑"]');
    expect(toolbar("[data-dms-mockup-duplicate]")).toBe('["⌘","D"]');
    expect(toolbar("[data-dms-mockup-undo]")).toBe('["⌘","Z"]');
    expect(toolbar("[data-dms-mockup-redo]")).toBe('["⌘","⇧","Z"]');
  });
});
