/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  buildNavSearchShortcuts,
  buildPageSearchShortcuts,
  PAGE_SEARCH_SHORTCUTS,
  pageSearchAriaKeyshortcuts,
} from "../layers/dms-ui/app/entries/composables/global/searchShortcuts";
import * as publicSearchShortcuts from "../layers/dms-ui/app/composables/global/searchShortcuts";

let app: App;
let host: HTMLDivElement;

const navInput = () => document.getElementById("nav-search")!;
const pageInput = () => document.getElementById("page-search")!;

/**
 * The settings shell and the Shortcuts page bind their keys with two separate
 * `defineShortcuts` calls (two keydown listeners), as in the app: SettingsNav
 * ("/") and the page (⌘ / or Ctrl /).
 */
function mountSettingsShortcutsPage() {
  const Harness = defineComponent({
    setup() {
      defineShortcuts(buildNavSearchShortcuts(() => navInput().focus()));
      defineShortcuts(buildPageSearchShortcuts(() => pageInput().focus()));
      return () => [
        h("input", { id: "nav-search" }),
        h("input", { id: "page-search" }),
      ];
    },
  });
  app = createApp(Harness);
  app.mount(host);
}

function press(
  key: string,
  modifiers: KeyboardEventInit = {},
  target: EventTarget = document.activeElement ?? document.body,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  mountSettingsShortcutsPage();
  await nextTick();
});

afterEach(() => {
  app.unmount();
  document.body.innerHTML = "";
});

describe("settings search shortcuts on the Shortcuts page", () => {
  it('focuses the settings menu search on "/"', () => {
    expect(press("/").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(navInput());
  });

  it("focuses the page search on Ctrl + /", () => {
    expect(press("/", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(pageInput());
  });

  it('focuses the page search on Ctrl + Shift + : (AZERTY "/")', () => {
    press("/", { ctrlKey: true, shiftKey: true });
    expect(document.activeElement).toBe(pageInput());
  });

  it('focuses the settings menu search on Shift + : (AZERTY "/")', () => {
    press("/", { shiftKey: true });
    expect(document.activeElement).toBe(navInput());
  });

  it('lets "/" be typed in a search without moving the focus', async () => {
    pageInput().focus();
    await nextTick();
    expect(press("/").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(pageInput());

    navInput().focus();
    await nextTick();
    expect(press("/").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(navInput());
  });

  it("ignores Ctrl + / while typing in an input", async () => {
    navInput().focus();
    await nextTick();
    expect(press("/", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(navInput());
  });

  it("ignores Ctrl + / in a contenteditable", async () => {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();
    Object.defineProperty(editor, "contentEditable", { value: "true" });
    await nextTick();
    expect(press("/", { ctrlKey: true }, editor).defaultPrevented).toBe(false);
    expect(press("/", {}, editor).defaultPrevented).toBe(false);
  });
});

describe("settings search shortcut maps", () => {
  it("are public where the UI toolkit docs import them", () => {
    expect(publicSearchShortcuts.buildPageSearchShortcuts).toBe(
      buildPageSearchShortcuts,
    );
    expect(publicSearchShortcuts.PAGE_SEARCH_SHORTCUTS).toBe(
      PAGE_SEARCH_SHORTCUTS,
    );
  });

  it("never bind the same key twice", () => {
    const nav = Object.keys(buildNavSearchShortcuts(() => {}));
    const page = Object.keys(buildPageSearchShortcuts(() => {}));
    expect(nav).toEqual(["/"]);
    expect(page).toEqual(["meta_/", "meta_shift_/"]);
    expect(nav.filter((key) => page.includes(key))).toEqual([]);
  });

  it("describe the page search keys per platform", () => {
    expect(pageSearchAriaKeyshortcuts(true)).toBe("Meta+/");
    expect(pageSearchAriaKeyshortcuts(false)).toBe("Control+/");
  });
});
