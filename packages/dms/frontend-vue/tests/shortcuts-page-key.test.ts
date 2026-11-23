/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
  type FunctionalComponent,
  type Ref,
} from "vue";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import {
  useCommandPaletteAssistant,
  type CommandPaletteAssistant,
} from "../layers/dms-layout/app/composables/useCommandPaletteAssistant";
import DashboardSearch from "../layers/dms-layout/app/components/layout/DashboardSearch.vue";
import shortcutsRegistry from "../layers/dms-ui/app/config/shortcuts-registry";
import { PaletteStub } from "./fixtures/dashboard-search-stub";
import { defined } from "./helpers/defined";

const SHORTCUTS_PAGE = "/settings/user/shortcuts";

const navigateDms = vi.fn();
type StoredState = Array<Partial<CommandPaletteAssistant>>;

let state: Map<string, Ref<StoredState>>;
let app: App;
let host: HTMLDivElement;

const Passthrough: FunctionalComponent = (_, { slots }) =>
  h("span", slots.default?.());
const IconStub: FunctionalComponent = () => h("i");

function installRuntime(): void {
  state = new Map();
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsAppConfig", () => ({ ui: { icons: {} } }));
  vi.stubGlobal("useCommandPaletteGroups", () => ({ groups: ref([]) }));
  vi.stubGlobal("useDmsState", (key: string, initial: () => StoredState) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useCommandPaletteAssistant", useCommandPaletteAssistant);
  vi.stubGlobal("COMMAND_PALETTE_FUSE_OPTIONS", {});
  vi.stubGlobal("defineShortcuts", defineShortcuts);
  vi.stubGlobal("navigateDms", navigateDms);
}

function mountDashboard(): void {
  const Shell = defineComponent(() => () => [
    h(DashboardSearch),
    h("input", { id: "search" }),
  ]);
  app = createApp(Shell);
  app.component("UDashboardSearch", PaletteStub);
  app.component("UButton", Passthrough);
  app.component("UKbd", Passthrough);
  app.component("UIcon", IconStub);
  app.mount(host);
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  installRuntime();
  mountDashboard();
  await nextTick();
});

afterEach(() => {
  app.unmount();
  host.remove();
  navigateDms.mockReset();
  vi.unstubAllGlobals();
});

describe("the ? shortcut", () => {
  it("opens the shortcuts page outside a text field", () => {
    const event = press("?", { shiftKey: true });
    expect(navigateDms).toHaveBeenCalledExactlyOnceWith(SHORTCUTS_PAGE);
    expect(event.defaultPrevented).toBe(true);
  });

  it("also opens it when the layout types ? without Shift", () => {
    press("?");
    expect(navigateDms).toHaveBeenCalledExactlyOnceWith(SHORTCUTS_PAGE);
  });

  it("only types the character in an input", () => {
    const search = defined(host.querySelector<HTMLInputElement>("#search"));
    search.focus();
    const event = press("?", { shiftKey: true });
    expect(navigateDms).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores ? held with Ctrl", () => {
    press("?", { ctrlKey: true });
    expect(navigateDms).not.toHaveBeenCalled();
  });
});

describe("the shortcuts page listing", () => {
  const entry = shortcutsRegistry
    .find((group) => group.component === "Global")
    ?.shortcuts.find((item) => item.key.includes("?"));

  it("lists ? under Global", () => {
    expect(entry?.key).toEqual(["?"]);
    expect(entry?.component).toBe("$dms.components.global");
  });
});
