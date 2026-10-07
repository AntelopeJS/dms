// @vitest-environment jsdom
/**
 * Accessibility preferences (Settings › Appearance): how the cookie is read,
 * how `auto` motion resolves against the system, which classes land on
 * `<html>`, and that the server renders them next to the color-mode class.
 */
import { useHead } from "@unhead/vue";
import {
  createHead as createClientHead,
  renderDOMHead,
} from "@unhead/vue/client";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createApp, createSSRApp, nextTick, ref, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessibilityHtmlClasses,
  isReducedMotionActive,
  parseAccessibilityPreferences,
  reduceMotionFromClasses,
  resolveReducedMotion,
  type AccessibilityPreferences,
} from "../layers/dms-ui/app/build/utils/accessibilityPreferences";

interface CookieOptions {
  default: () => unknown;
  maxAge?: number;
}

const ACCESSIBILITY_COOKIE = "dms-accessibility";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const DEFAULTS: AccessibilityPreferences = {
  reduceMotion: "auto",
  increaseContrast: false,
  underlineLinks: false,
};
const requestCookies = new Map<string, unknown>();
const cookieOptions = new Map<string, CookieOptions>();
// One ref per cookie name, shared by every caller like the real useDmsCookie.
const cookieRefs = new Map<string, Ref<unknown>>();

vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
vi.stubGlobal("useHead", useHead);
vi.stubGlobal("useDmsCookie", (name: string, options: CookieOptions) => {
  cookieOptions.set(name, options);
  if (!cookieRefs.has(name))
    cookieRefs.set(
      name,
      ref(
        requestCookies.has(name) ? requestCookies.get(name) : options.default(),
      ),
    );
  return cookieRefs.get(name);
});

const { default: accessibilityPlugin } = await import(
  "../layers/dms-layout/app/plugins/accessibility"
);
const { useApexChart } = await import(
  "../layers/dms-ui/app/composables/chart/useApexChart"
);
const { useAccessibilityPreferences } = await import(
  "../layers/dms-layout/app/composables/general/useAccessibilityPreferences"
);

beforeEach(() => {
  requestCookies.clear();
  cookieOptions.clear();
  cookieRefs.clear();
  document.documentElement.className = "";
});

describe("parseAccessibilityPreferences", () => {
  it("falls back to the defaults without a cookie", () => {
    expect(parseAccessibilityPreferences(undefined)).toEqual(DEFAULTS);
    expect(parseAccessibilityPreferences(null)).toEqual(DEFAULTS);
  });

  it("keeps the explicit values of a parsed cookie", () => {
    expect(
      parseAccessibilityPreferences({
        reduceMotion: "on",
        increaseContrast: true,
        underlineLinks: true,
      }),
    ).toEqual({
      reduceMotion: "on",
      increaseContrast: true,
      underlineLinks: true,
    });
  });

  it("reads the raw URI-encoded JSON a browser cookie holds", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ reduceMotion: "off", underlineLinks: true }),
    );

    expect(parseAccessibilityPreferences(raw)).toEqual({
      reduceMotion: "off",
      increaseContrast: false,
      underlineLinks: true,
    });
  });

  it.each([
    ["malformed JSON", "%7Bnot-json"],
    ["a bare string", "on"],
    ["an array", ["on"]],
    ["a number", 3],
  ])("ignores %s", (_label, raw) => {
    expect(parseAccessibilityPreferences(raw)).toEqual(DEFAULTS);
  });

  it("defaults each unknown field on its own", () => {
    expect(
      parseAccessibilityPreferences({
        reduceMotion: "sometimes",
        increaseContrast: "yes",
        underlineLinks: true,
      }),
    ).toEqual({ ...DEFAULTS, underlineLinks: true });
  });
});

describe("resolveReducedMotion", () => {
  it.each([
    ["auto", false, false],
    ["auto", true, true],
    ["on", false, true],
    ["on", true, true],
    ["off", false, false],
    ["off", true, false],
  ] as const)(
    "%s with a system reduce of %s gives %s",
    (preference, system, expected) => {
      expect(resolveReducedMotion(preference, system)).toBe(expected);
    },
  );
});

describe("accessibilityHtmlClasses", () => {
  it("adds no class for the defaults", () => {
    expect(accessibilityHtmlClasses(DEFAULTS)).toEqual([]);
  });

  it("pins motion with a class only when it is explicit", () => {
    expect(
      accessibilityHtmlClasses({ ...DEFAULTS, reduceMotion: "on" }),
    ).toEqual(["dms-reduce-motion"]);
    expect(
      accessibilityHtmlClasses({ ...DEFAULTS, reduceMotion: "off" }),
    ).toEqual(["dms-full-motion"]);
  });

  it("maps every option at once", () => {
    expect(
      accessibilityHtmlClasses({
        reduceMotion: "on",
        increaseContrast: true,
        underlineLinks: true,
      }),
    ).toEqual([
      "dms-reduce-motion",
      "dms-increase-contrast",
      "dms-underline-links",
    ]);
  });

  it("round-trips the motion preference through the classes", () => {
    for (const reduceMotion of ["auto", "on", "off"] as const) {
      const classes = new Set(
        accessibilityHtmlClasses({ ...DEFAULTS, reduceMotion }),
      );
      expect(
        reduceMotionFromClasses({ contains: (token) => classes.has(token) }),
      ).toBe(reduceMotion);
    }
  });
});

describe("useAccessibilityPreferences", () => {
  it("reads the dms-accessibility cookie, kept a year", () => {
    useAccessibilityPreferences();

    const options = cookieOptions.get(ACCESSIBILITY_COOKIE);
    expect(options?.maxAge).toBe(ONE_YEAR_IN_SECONDS);
    expect(options?.default()).toEqual(DEFAULTS);
  });

  it("writes one field without touching the others", () => {
    requestCookies.set(ACCESSIBILITY_COOKIE, {
      reduceMotion: "on",
      increaseContrast: false,
      underlineLinks: true,
    });
    const { increaseContrast, preferences } = useAccessibilityPreferences();

    increaseContrast.value = true;

    expect(preferences.value).toEqual({
      reduceMotion: "on",
      increaseContrast: true,
      underlineLinks: true,
    });
  });
});

describe("server render", () => {
  // `colorMode` stands for the color-mode plugin, whose server branch puts an
  // explicit mode's class on <html> through its own useHead entry.
  async function renderHead(
    cookies: Record<string, unknown>,
    colorMode?: string,
  ) {
    for (const [name, value] of Object.entries(cookies))
      requestCookies.set(name, value);
    const app = createSSRApp({ render: () => null });
    const head = createHead();
    app.use(head);
    app.runWithContext(() => {
      if (colorMode) useHead({ htmlAttrs: { class: colorMode } });
      accessibilityPlugin({} as never);
    });
    return renderSSRHead(head);
  }

  it("renders the classes on <html> next to the color mode", async () => {
    const { htmlAttrs } = await renderHead(
      {
        [ACCESSIBILITY_COOKIE]: {
          reduceMotion: "on",
          increaseContrast: true,
          underlineLinks: false,
        },
      },
      "dark",
    );

    const classes = /class="([^"]*)"/.exec(htmlAttrs)?.[1].split(" ");
    expect(classes).toEqual(
      expect.arrayContaining([
        "dark",
        "dms-reduce-motion",
        "dms-increase-contrast",
      ]),
    );
    expect(classes).not.toContain("dms-underline-links");
  });

  it("renders no class attribute for the defaults", async () => {
    const { htmlAttrs } = await renderHead({});

    expect(htmlAttrs).not.toContain("class");
  });
});

describe("in the browser", () => {
  it("toggles only its own <html> classes, keeping the color mode", async () => {
    document.documentElement.className = "dark";
    const app = createApp({ render: () => null });
    const head = createClientHead();
    app.use(head);
    const { underlineLinks, reduceMotion } = app.runWithContext(() => {
      accessibilityPlugin({} as never);
      return useAccessibilityPreferences();
    });
    await renderDOMHead(head);
    expect([...document.documentElement.classList]).toEqual(["dark"]);

    underlineLinks.value = true;
    reduceMotion.value = "on";
    await nextTick();
    await renderDOMHead(head);
    expect([...document.documentElement.classList].sort()).toEqual([
      "dark",
      "dms-reduce-motion",
      "dms-underline-links",
    ]);

    underlineLinks.value = false;
    reduceMotion.value = "auto";
    await nextTick();
    await renderDOMHead(head);
    expect([...document.documentElement.classList]).toEqual(["dark"]);
  });

  it("reads reduced motion off the <html> class, then the system", () => {
    const systemReduces = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("matchMedia", systemReduces);

    expect(isReducedMotionActive()).toBe(true);
    expect(systemReduces).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    document.documentElement.classList.add("dms-full-motion");
    expect(isReducedMotionActive()).toBe(false);
    document.documentElement.className = "dms-reduce-motion";
    systemReduces.mockReturnValue({ matches: false });
    expect(isReducedMotionActive()).toBe(true);

    vi.unstubAllGlobals();
  });
});

describe("chart animations", () => {
  function animationsEnabled(): unknown {
    const { options } = useApexChart(() => ({
      type: "line",
      series: [{ name: "Visits", data: [{ x: "Mon", y: 3 }] }],
    }));
    const chart = options.value.chart as { animations: { enabled: boolean } };
    return chart.animations.enabled;
  }

  it("animates by default and stops when motion is reduced", () => {
    expect(animationsEnabled()).toBe(true);

    document.documentElement.classList.add("dms-reduce-motion");
    expect(animationsEnabled()).toBe(false);
  });
});
