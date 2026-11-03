/** @vitest-environment jsdom */
/**
 * The brand logo is announced by name: the configured `branding.logo.alt`
 * reaches both the light and the dark image.
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal("useDmsAppConfig", () => ({
  branding: {
    logo: {
      alt: "Northstar",
      default: { light: "/light.svg", dark: "/dark.svg" },
    },
  },
}));

const { default: AppLogo } = await import(
  "../layers/dms-layout/app/components/layout/AppLogo.vue"
);

const UColorModeImage = defineComponent({
  inheritAttrs: false,
  props: { light: String, dark: String },
  setup:
    (props, { attrs }) =>
    () => [
      h("img", { src: props.light, ...attrs }),
      h("img", { src: props.dark, ...attrs }),
    ],
});

let app: App | undefined;

afterEach(() => app?.unmount());

it("gives every rendered logo image the configured name as its alt", () => {
  const host = document.createElement("div");
  app = createApp({ render: () => h(AppLogo) });
  app.component("UColorModeImage", UColorModeImage);
  app.mount(host);

  const alts = [...host.querySelectorAll("img")].map((img) =>
    img.getAttribute("alt"),
  );
  expect(alts).toEqual(["Northstar", "Northstar"]);
});
