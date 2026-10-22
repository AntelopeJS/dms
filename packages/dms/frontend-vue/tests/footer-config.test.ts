// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  type App,
} from "vue";
import type { DmsFooterConfig } from "../layers/dms-core/shared/types/app-config";

let app: App | undefined;
let host: HTMLDivElement;
let footerConfig: DmsFooterConfig | undefined;
let isLoggedIn = false;
const setLocale = vi.fn(async () => {});
const changeLanguage = vi.fn(async () => {});

const SelectStub = defineComponent({
  emits: ["update:modelValue"],
  setup:
    (_, { emit }) =>
    () =>
      h("select", {
        "data-locale-switcher": "",
        onChange: () => emit("update:modelValue", "fr"),
      }),
});

async function mountFooter(): Promise<void> {
  const { default: Footer } = await import(
    "../layers/dms-layout/app/build/components/layout/Footer.vue"
  );
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(Footer);
  app.component("DmsLink", {
    props: ["to"],
    setup:
      (props: { to: string }, { slots }) =>
      () =>
        h("a", { href: props.to }, slots.default?.()),
  });
  app.component("UIcon", { render: () => null });
  app.component("USkeleton", { render: () => null });
  app.component("USelect", SelectStub);
  app.mount(host);
  await nextTick();
}

function linkTexts(): string[] {
  return [...host.querySelectorAll("a")]
    .map((link) => link.textContent?.trim() ?? "")
    .filter((text) => text.length > 0);
}

beforeEach(async () => {
  vi.resetModules();
  footerConfig = undefined;
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  isLoggedIn = false;
  setLocale.mockClear();
  changeLanguage.mockClear();
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en"),
    setLocale,
    t: (key: string) => key,
  }));
  vi.stubGlobal("useDmsUserSession", () => ({
    loggedIn: computed(() => isLoggedIn),
  }));
  vi.stubGlobal("useUserLanguage", () => ({ changeLanguage }));
  vi.stubGlobal("useUniqueLocales", () => ({ uniqueLocales: ref([]) }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) =>
      text.startsWith("$") ? `t(${text.slice(1)})` : text,
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    branding: { footer: footerConfig },
  }));
  const footerLinks = await import(
    "../layers/dms-layout/app/composables/useFooterLinks"
  );
  vi.stubGlobal("useFooterLinks", footerLinks.useFooterLinks);
  vi.stubGlobal("registerFooterLink", footerLinks.registerFooterLink);
  vi.stubGlobal("unregisterFooterLink", footerLinks.unregisterFooterLink);
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});

describe("footer", () => {
  it("shows the copyright, the Antelope links, the star and the language picker by default", async () => {
    await mountFooter();
    expect(host.textContent).toContain("© Antelope");
    expect(linkTexts()).toEqual([
      "empty_layout.footer.documentation",
      "empty_layout.footer.website",
      "empty_layout.footer.github_star",
    ]);
    expect(host.querySelector("[data-locale-switcher]")).not.toBeNull();
  });

  it("drops a link a layer unregisters, the Antelope ones included", async () => {
    const { registerFooterLink, unregisterFooterLink } = await import(
      "../layers/dms-layout/app/composables/useFooterLinks"
    );
    registerFooterLink({
      id: "acme:status",
      label: "Status",
      to: "/status",
      order: 30,
    });
    unregisterFooterLink("dms:documentation");
    unregisterFooterLink("dms:website");
    unregisterFooterLink("never-registered");
    await mountFooter();
    expect(linkTexts()).toEqual(["Status", "empty_layout.footer.github_star"]);
  });

  it("names the copyright holder, or drops it, the star and the picker", async () => {
    footerConfig = { copyright: "$acme.name" };
    await mountFooter();
    expect(host.textContent).toContain("© t(acme.name)");
    app?.unmount();
    host.remove();
    vi.mocked(fetch).mockClear();

    footerConfig = {
      copyright: false,
      githubStar: false,
      localeSwitcher: false,
    };
    await mountFooter();
    expect(host.textContent).not.toContain("©");
    expect(linkTexts()).not.toContain("empty_layout.footer.github_star");
    expect(host.querySelector("[data-locale-switcher]")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("switches only the screen's language for a visitor", async () => {
    await mountFooter();
    host
      .querySelector("[data-locale-switcher]")!
      .dispatchEvent(new Event("change"));
    await nextTick();
    expect(setLocale).toHaveBeenCalledWith("fr");
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it("stores a signed-in user's switch on their profile", async () => {
    isLoggedIn = true;
    await mountFooter();
    host
      .querySelector("[data-locale-switcher]")!
      .dispatchEvent(new Event("change"));
    await nextTick();
    expect(changeLanguage).toHaveBeenCalledWith("fr");
    expect(setLocale).not.toHaveBeenCalled();
  });
});
