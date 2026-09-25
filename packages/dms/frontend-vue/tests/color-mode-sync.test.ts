// @vitest-environment jsdom
/**
 * The color-mode plugin in the browser, in boot order: the pre-paint script
 * runs while `<head>` parses, Nuxt UI's `useDark()` runs when the app installs
 * Nuxt UI, then the DMS plugins run. The `dms-color-mode` cookie is the source
 * of truth, and vueuse's store, which Nuxt UI's components share, mirrors it
 * both ways.
 */
import { useColorMode, useDark } from "@vueuse/core";
import { computed, effectScope, ref, type EffectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ColorSchemeChange {
  matches: boolean;
}

type ColorSchemeListener = (change: ColorSchemeChange) => void;

interface HeadScript {
  innerHTML: string;
}

interface HeadInput {
  script: HeadScript[];
}

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const VUEUSE_STORAGE_KEY = "vueuse-color-scheme";
const colorSchemeListeners = new Set<ColorSchemeListener>();
const storedPreference = ref("system");
const cookieWrites = vi.fn();
const preference = computed({
  get: () => storedPreference.value,
  set: (next: string) => {
    cookieWrites(next);
    storedPreference.value = next;
  },
});
const head = vi.fn();
let prefersDark = false;
let scope: EffectScope;

vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
vi.stubGlobal("useHead", head);
vi.stubGlobal("useDmsCookie", () => preference);

const { default: colorModePlugin } = await import(
  "../layers/dms-layout/app/plugins/color-mode"
);

function serverRenderedScript(): string {
  vi.stubEnv("SSR", true);
  colorModePlugin({} as never);
  vi.unstubAllEnvs();
  return (head.mock.lastCall?.[0] as HeadInput).script[0].innerHTML;
}

const prePaintScript = serverRenderedScript();

function stubSystemColorScheme(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === DARK_SCHEME_QUERY && prefersDark;
    },
    addEventListener: (_type: string, listener: ColorSchemeListener) =>
      colorSchemeListeners.add(listener),
    removeEventListener: (_type: string, listener: ColorSchemeListener) =>
      colorSchemeListeners.delete(listener),
  }));
}

function switchSystemColorScheme(isDark: boolean): void {
  prefersDark = isDark;
  colorSchemeListeners.forEach((listener) => listener({ matches: isDark }));
}

function paint(cookie?: string): void {
  if (cookie !== undefined) document.cookie = `dms-color-mode=${cookie}`;
  new Function(prePaintScript)();
}

/** What `@nuxt/ui/vue-plugin` runs when the app installs it. */
function bootNuxtUi() {
  return scope.run(() => useDark())!;
}

/** A Nuxt UI color-mode component's store, `UDashboardSearch`'s theme group. */
function mountNuxtUiComponent() {
  return scope.run(() => useColorMode())!;
}

function bootDmsPlugin(): void {
  scope.run(() => colorModePlugin({} as never));
}

function htmlClasses(): string[] {
  return [...document.documentElement.classList];
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

beforeEach(() => {
  scope = effectScope();
  prefersDark = false;
  storedPreference.value = "system";
  cookieWrites.mockClear();
  localStorage.clear();
  document.cookie = "dms-color-mode=; max-age=0";
  document.documentElement.className = "";
  stubSystemColorScheme();
});

afterEach(() => {
  scope.stop();
  colorSchemeListeners.clear();
});

describe("pre-paint script", () => {
  it("hands vueuse the cookie's mode, so Nuxt UI boots agreeing", () => {
    localStorage.setItem(VUEUSE_STORAGE_KEY, "light");
    // What the renderer's own pre-paint script may still have added.
    document.documentElement.classList.add("light");

    paint("%22dark%22");

    expect(localStorage.getItem(VUEUSE_STORAGE_KEY)).toBe("dark");
    expect(htmlClasses()).toEqual(["dark"]);
    expect(bootNuxtUi().value).toBe(true);
    expect(htmlClasses()).toEqual(["dark"]);
  });

  it.each([
    {
      source: "light as useDmsCookie writes it, on a dark system",
      cookie: "%22light%22",
      prefersDark: true,
      stored: "light",
      painted: "light",
    },
    {
      source: "a raw dark",
      cookie: "dark",
      prefersDark: false,
      stored: "dark",
      painted: "dark",
    },
    {
      source: "system on a dark system",
      cookie: "%22system%22",
      prefersDark: true,
      stored: "auto",
      painted: "dark",
    },
    {
      source: "no cookie on a light system",
      cookie: undefined,
      prefersDark: false,
      stored: "auto",
      painted: "light",
    },
    {
      source: "an unknown value on a dark system",
      cookie: "%22sepia%22",
      prefersDark: true,
      stored: "auto",
      painted: "dark",
    },
  ])(
    "stores $stored and paints $painted for $source",
    ({ cookie, prefersDark: isDark, stored, painted }) => {
      prefersDark = isDark;

      paint(cookie);

      expect(localStorage.getItem(VUEUSE_STORAGE_KEY)).toBe(stored);
      expect(htmlClasses()).toEqual([painted]);
    },
  );
});

describe("sync with Nuxt UI's store", () => {
  it("boots without writing either side when the script already agreed", () => {
    storedPreference.value = "dark";
    paint("%22dark%22");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    bootNuxtUi();
    bootDmsPlugin();

    expect(setItem).not.toHaveBeenCalled();
    expect(cookieWrites).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("brings the store in line on boot when the pre-paint script did not run", async () => {
    storedPreference.value = "dark";
    localStorage.setItem(VUEUSE_STORAGE_KEY, "light");

    const isDark = bootNuxtUi();
    bootDmsPlugin();
    await settle();

    expect(isDark.value).toBe(true);
    expect(htmlClasses()).toEqual(["dark"]);
    expect(cookieWrites).not.toHaveBeenCalled();
  });

  it("mirrors a preference change into the store Nuxt UI's components read", async () => {
    paint();
    bootNuxtUi();
    bootDmsPlugin();
    const component = mountNuxtUiComponent();

    preference.value = "dark";
    await settle();

    expect(component.store.value).toBe("dark");
    expect(htmlClasses()).toEqual(["dark"]);
    expect(cookieWrites.mock.calls).toEqual([["dark"]]);

    preference.value = "system";
    await settle();

    expect(component.store.value).toBe("auto");
    expect(htmlClasses()).toEqual(["light"]);
  });

  it("writes a theme picked in a Nuxt UI component back to the cookie", async () => {
    paint();
    bootNuxtUi();
    bootDmsPlugin();
    const component = mountNuxtUiComponent();

    component.store.value = "dark";
    await settle();

    expect(cookieWrites.mock.calls).toEqual([["dark"]]);
    expect(htmlClasses()).toEqual(["dark"]);

    component.store.value = "auto";
    await settle();

    expect(cookieWrites.mock.calls).toEqual([["dark"], ["system"]]);
  });

  it("follows the system color scheme while the preference is system", async () => {
    paint();
    bootNuxtUi();
    bootDmsPlugin();
    expect(htmlClasses()).toEqual(["light"]);

    switchSystemColorScheme(true);
    await settle();

    expect(htmlClasses()).toEqual(["dark"]);
  });
});
