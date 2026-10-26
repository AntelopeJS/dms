// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, ref, type App } from "vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import iconsPlugin from "@nuxt/ui/runtime/vue/plugins/icons.js";
import { icons } from "@iconify-json/ph/icons.json";
import ProfileSecuritySummary from "../layers/dms-layout/app/build/components/pages/settings/profile/ProfileSecuritySummary.vue";
import { browserRuntime, stubApiData } from "./helpers/api-data-runtime";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("names every point that needs attention, not only the first", async () => {
  installAuthSettingsRuntime();
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  const authFetch = vi.fn(async () => ({
    activeSessions: 9,
    twoFactor: { methods: ["totp"] },
    attention: ["backup_codes_low", "backup_codes_unsaved"],
    attentionTone: "error",
  }));
  stubApiData(authFetch);
  app = createApp(ProfileSecuritySummary);
  browserRuntime(app);
  app.use(iconsPlugin);
  app.component("UIcon", UIcon);
  app.component("UButton", () => null);
  app.component("USkeleton", () => null);
  const host = document.createElement("div");
  app.mount(host);
  await vi.waitFor(() =>
    expect(host.textContent).toContain(
      "page.settings.profile.security_attention — page.settings.security.attention.backup_codes_low and page.settings.security.attention.backup_codes_unsaved.",
    ),
  );
  expect(authFetch).toHaveBeenCalledExactlyOnceWith(
    "/dms/pages/settings/user/security",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(
    host
      .querySelector("span[aria-hidden='true']")
      ?.classList.contains("text-error"),
  ).toBe(true);
});

it.each([
  {
    attention: ["two_factor_off"],
    attentionTone: "warning",
    color: "text-warning",
    icon: icons["shield-warning"],
  },
  {
    attention: [],
    attentionTone: null,
    color: "text-muted",
    icon: icons["shield-check"],
  },
])(
  "renders $color security status with the matching shield",
  async ({ attention, attentionTone, color, icon }) => {
    installAuthSettingsRuntime();
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      locale: ref("en-GB"),
    }));
    stubApiData(async () => ({
      activeSessions: 9,
      twoFactor: { methods: attention.length ? [] : ["totp"] },
      attention,
      attentionTone,
    }));
    app = createApp(ProfileSecuritySummary);
    browserRuntime(app);
    app.use(iconsPlugin);
    app.component("UIcon", UIcon);
    app.component("UButton", () => null);
    app.component("USkeleton", () => null);
    const host = document.createElement("div");
    app.mount(host);
    const expected = document.createElement("div");
    expected.innerHTML = `<svg>${icon.body}</svg>`;
    await vi.waitFor(() => {
      const well = host.querySelector("span[aria-hidden='true']");
      expect(well?.classList.contains(color)).toBe(true);
      expect(well?.querySelector("svg")?.innerHTML).toBe(
        expected.firstElementChild?.innerHTML,
      );
    });
  },
);
