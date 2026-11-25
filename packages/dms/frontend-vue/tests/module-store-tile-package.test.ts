/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { computed, createApp, h, ref, watch, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import ModuleStoreTile from "../layers/dms-layout/app/build/components/pages/modules/ModuleStoreTile.vue";
import { toModuleStoreEntry } from "../layers/dms-layout/app/entries/utils/module-store-catalog";
import { listingEntry } from "./helpers/module-store-catalog-fixtures";

const PACKAGE = "@antelopejs/dms-media-with-a-long-package-name";
let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

function mountTile(overrides: Parameters<typeof listingEntry>[1] = {}) {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  app = createApp(ModuleStoreTile, {
    entry: toModuleStoreEntry(
      listingEntry("media", { package: PACKAGE, ...overrides }),
    ),
  });
  for (const key of [
    "DmsIconWell",
    "DmsStatusPill",
    "UIcon",
    "UButton",
    "ULink",
  ]) {
    app.component(key, () => null);
  }
  app.component("UTooltip", (_, { slots }) => h("div", slots.default?.()));
  const host = document.createElement("div");
  app.mount(host);
  return host;
}

it("copies the full package name from an available module", async () => {
  const copied: string[] = [];
  const clipboard = Object.getOwnPropertyDescriptor(
    window.navigator,
    "clipboard",
  );
  const execCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
  Object.defineProperty(window.navigator, "clipboard", {
    value: {},
    configurable: true,
  });
  Object.defineProperty(document, "execCommand", {
    value: vi.fn(() => {
      copied.push(document.querySelector("textarea")?.value ?? "");
      return true;
    }),
    configurable: true,
  });
  try {
    const host = mountTile();
    expect(
      host.querySelector(`[title="${PACKAGE}"]`)?.textContent?.trim(),
    ).toBe(PACKAGE);
    const button = host.querySelector<HTMLButtonElement>(
      `[title="${PACKAGE}"] button`,
    );
    expect(button?.getAttribute("aria-label")).toBe("dms.button.copy");
    button?.click();
    await vi.waitFor(() =>
      expect(button?.getAttribute("aria-label")).toBe("dms.button.copied"),
    );
    expect(copied).toEqual([PACKAGE]);
  } finally {
    if (clipboard)
      Object.defineProperty(window.navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(window.navigator, "clipboard");
    if (execCommand)
      Object.defineProperty(document, "execCommand", execCommand);
    else Reflect.deleteProperty(document, "execCommand");
  }
});

it.each([
  { state: "active", installedVersion: "0.5.0" },
  { isWorkingCopy: true },
] as const)("omits the package copy button for %j", (overrides) => {
  const host = mountTile(overrides);
  expect(
    host.querySelector(
      `[title="${PACKAGE}"], button[aria-label="dms.button.copy"]`,
    ),
  ).toBeNull();
});
