/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import ModuleStoreBanners from "../layers/dms-layout/app/build/components/pages/modules/ModuleStoreBanners.vue";

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

function mountNotice(key: "dev" | "production" | "unknown") {
  vi.stubGlobal("useI18n", () => ({ t: (value: string) => value }));
  app = createApp(ModuleStoreBanners, {
    listing: undefined,
    frontendNotice: { key, names: "Media" },
  });
  app.component("DmsNoticeBanner", (_props, { slots }) =>
    h("aside", slots.description?.()),
  );
  app.component(
    "I18nT",
    defineComponent({
      props: { keypath: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h("span", props.keypath.includes(".dev.") ? [] : slots.command?.()),
    }),
  );
  app.component("UIcon", () => null);
  const host = document.createElement("div");
  app.mount(host);
  return host;
}

it.each(["production", "unknown"] as const)(
  "copies the frontend rebuild command in the %s banner",
  async (key) => {
    const copied: string[] = [];
    const clipboard = Object.getOwnPropertyDescriptor(
      window.navigator,
      "clipboard",
    );
    const execCommand = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
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
      const host = mountNotice(key);
      const code = host.querySelector("code");
      const button = host.querySelector<HTMLButtonElement>("button");
      expect(code?.textContent?.trim()).toBe("ajs dms build");
      expect(code?.nextElementSibling).toBe(button);
      expect(button?.getAttribute("aria-label")).toBe("dms.button.copy");
      button?.click();
      await vi.waitFor(() =>
        expect(button?.getAttribute("aria-label")).toBe("dms.button.copied"),
      );
      expect(copied).toEqual(["ajs dms build"]);
    } finally {
      if (clipboard)
        Object.defineProperty(window.navigator, "clipboard", clipboard);
      else Reflect.deleteProperty(window.navigator, "clipboard");
      if (execCommand)
        Object.defineProperty(document, "execCommand", execCommand);
      else Reflect.deleteProperty(document, "execCommand");
    }
  },
);

it("does not offer a rebuild command in the dev banner", () => {
  const host = mountNotice("dev");
  expect(host.querySelector("code, button")).toBeNull();
});
