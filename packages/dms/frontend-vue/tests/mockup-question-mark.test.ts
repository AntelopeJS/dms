/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, ref, type FunctionalComponent } from "vue";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import DashboardSearch from "../layers/dms-layout/app/components/layout/DashboardSearch.vue";
import { useCommandPaletteAssistant } from "../layers/dms-layout/app/composables/useCommandPaletteAssistant";
import { PaletteStub } from "./fixtures/dashboard-search-stub";
import {
  flush,
  mountViewer,
  stubMockupRuntime,
  type MountedViewer,
} from "./helpers/mockup-runtime";

const Passthrough: FunctionalComponent = (_, { slots }) =>
  h("span", slots.default?.());

const navigateDms = vi.fn();
let viewer: MountedViewer;

/** Mounts the dashboard's palette, as the mockup layout's sidebar does, with Nuxt UI's real `defineShortcuts`. */
function mountDashboardSearch(): () => void {
  vi.stubGlobal("defineShortcuts", defineShortcuts);
  vi.stubGlobal("navigateDms", navigateDms);
  vi.stubGlobal("useDmsAppConfig", () => ({ ui: { icons: {} } }));
  vi.stubGlobal("useCommandPaletteGroups", () => ({ groups: ref([]) }));
  vi.stubGlobal("useCommandPaletteAssistant", useCommandPaletteAssistant);
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("COMMAND_PALETTE_FUSE_OPTIONS", {});
  const search = createApp(DashboardSearch);
  search.component("UDashboardSearch", PaletteStub);
  search.component("UButton", Passthrough);
  search.component("UKbd", Passthrough);
  search.mount(document.createElement("div"));
  return () => search.unmount();
}

afterEach(() => {
  viewer.unmount();
  navigateDms.mockReset();
  vi.unstubAllGlobals();
});

it("opens the viewer's shortcuts sheet on ? and leaves the shortcuts settings page closed (fails when the dashboard's ? binding also navigates)", async () => {
  stubMockupRuntime();
  const unmountSearch = mountDashboardSearch();
  viewer = await mountViewer();
  try {
    const event = new KeyboardEvent("keydown", {
      key: "?",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect(
      viewer.host.querySelector("[data-dms-mockup-shortcuts]"),
    ).not.toBeNull();
    expect(navigateDms).not.toHaveBeenCalled();
  } finally {
    unmountSearch();
  }
});
