/** @vitest-environment jsdom */
/**
 * The reads of the settings pages through the runtime's real async data: a
 * server render reads what the page shows and hands it to the browser, which
 * hydrates without asking again; the blocks of a page showing one request
 * share it, and a change still reads it again.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrate, serverRender, stubApiData } from "./helpers/api-data-runtime";
import { useSecurityOverview } from "../layers/dms-layout/app/build/composables/settings/security/useSecurityOverview";
import { useNotificationPreferences } from "../layers/dms-layout/app/build/composables/notification/useNotificationPreferences";
import { useNotificationCatalog } from "../layers/dms-layout/app/build/composables/notification/useNotificationCatalog";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";

const NOW = new Date("2026-10-15T12:00:00Z").getTime();
const MINUTE = 60_000;

const ANSWERS: Record<string, unknown> = {
  "/dms/pages/settings/user/security": {
    activeSessions: 2,
    attention: ["two_factor_off"],
    attentionTone: "warning",
    attentionTones: { two_factor_off: "warning" },
  },
  "/dms/pages/settings/user/security/sessions": [
    {
      _id: "other",
      browser: "Firefox",
      os: "Linux",

      lastActiveAt: new Date(NOW - 4.5 * MINUTE + 1000).toISOString(),
      isCurrent: false,
    },
  ],
  "/dms/pages/settings/user/notifications/categories": {
    categories: [{ id: "core", labelKey: "Core", icon: "i-ph-bell" }],
    subjects: [
      { id: "login", labelKey: "Login", category: { id: "core" } },
      { id: "mention", labelKey: "Mention", category: { id: "core" } },
    ],
  },
  "/dms/pages/settings/user/notifications/preferences": {
    "core:mention": false,
  },
};

const authFetch = vi.fn(async (url: string, options?: { method?: string }) => {
  if (options?.method === "PATCH") return undefined;
  return structuredClone(ANSWERS[url]);
});
const reads = () =>
  authFetch.mock.calls
    .filter(([, options]) => !options?.method)
    .map(([url]) => url);
const mounted: App[] = [];

/** Renders `root` on the server, then hydrates it: the reads of each side. */
async function renderAndHydrate(root: Component) {
  vi.stubEnv("SSR", true);
  const { html, payload } = await serverRender(root);
  vi.stubEnv("SSR", false);
  const server = reads();
  authFetch.mockClear();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { app, container } = hydrate(root, html, payload);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  const hydrationWarnings = warn.mock.calls
    .flat()
    .filter((message) => /hydration/i.test(String(message)));
  warn.mockRestore();
  return { html, container, server, browser: reads(), hydrationWarnings };
}

beforeEach(() => {
  installAuthSettingsRuntime();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en"),
    t: (key: string) => key,
    te: () => false,
  }));
  stubApiData(authFetch as never);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  authFetch.mockClear();
});

describe("Security", () => {
  it("renders the summary every block shares from one read, and the browser does not read it again", async () => {
    const Block = defineComponent({
      setup() {
        const { overview, attention } = useSecurityOverview();
        return () =>
          h("p", `${overview.value?.activeSessions}:${attention.value.join()}`);
      },
    });
    const Page = defineComponent({
      setup: () => () => h("div", [h(Block), h(Block)]),
    });

    const { html, server, browser, hydrationWarnings } =
      await renderAndHydrate(Page);
    expect(html).toBe(
      "<div><p>2:two_factor_off</p><p>2:two_factor_off</p></div>",
    );
    expect(server).toEqual(["/dms/pages/settings/user/security"]);
    expect(browser).toEqual([]);
    expect(hydrationWarnings).toEqual([]);
  });

  it("says when a session was last active as of the read, the same in the hydrating browser", async () => {
    const { default: SecuritySessions } = await import(
      "../layers/dms-layout/app/build/components/pages/settings/security/SecuritySessions.vue"
    );
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (key: string, named?: Record<string, unknown>) =>
        named ? `${key}(${Object.values(named).join()})` : key,
      te: () => false,
    }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    const slotted = (tag: string) =>
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            h(tag, [slots.badge?.(), slots.default?.(), slots.meta?.()]),
      });
    const register = (app: App) => {
      for (const name of ["DmsSection", "DmsListRow"])
        app.component(name, slotted("div"));
      for (const name of [
        "DmsEmptyState",
        "USkeleton",
        "UButton",
        "UBadge",
        "DmsStatusPill",
        "UModal",
      ])
        app.component(name, () => null);
    };

    vi.stubEnv("SSR", true);
    const { html, payload } = await serverRender(SecuritySessions, register);
    vi.stubEnv("SSR", false);
    expect(html).toContain("active_ago(4 minutes ago)");

    vi.setSystemTime(NOW + 2000);
    authFetch.mockClear();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, container } = hydrate(
      SecuritySessions,
      html,
      payload,
      register,
    );
    mounted.push(app);
    await nextTick();
    await new Promise((done) => setTimeout(done, 0));
    expect(reads()).toEqual([]);
    expect(container.innerHTML).toBe(html);
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/hydration/i);
    warn.mockRestore();
  });
});

describe("Notification preferences", () => {
  it("renders the preferences and the catalog the inbox shares, read once on the server", async () => {
    const Preferences = defineComponent({
      setup() {
        const { isLoading, isEnabled, categories, subjectsOf } =
          useNotificationPreferences();
        return () =>
          h(
            "ul",
            isLoading.value
              ? "loading"
              : categories.value.flatMap((category) =>
                  subjectsOf(category.id).map((subject) =>
                    h("li", `${subject.id}:${isEnabled(subject)}`),
                  ),
                ),
          );
      },
    });
    const Inbox = defineComponent({
      setup() {
        const { findCategory } = useNotificationCatalog();
        return () => h("p", findCategory("core")?.labelKey ?? "-");
      },
    });
    const Page = defineComponent({
      setup: () => () => h("div", [h(Preferences), h(Inbox)]),
    });

    const { html, server, browser, hydrationWarnings } =
      await renderAndHydrate(Page);
    expect(html).toBe(
      "<div><ul><li>login:true</li><li>mention:false</li></ul><p>Core</p></div>",
    );
    expect(server.sort()).toEqual([
      "/dms/pages/settings/user/notifications/categories",
      "/dms/pages/settings/user/notifications/preferences",
    ]);
    expect(browser).toEqual([]);
    expect(hydrationWarnings).toEqual([]);
  });

  it("reads nothing while the page does not show them", async () => {
    const Hidden = defineComponent({
      setup() {
        const { isLoading } = useNotificationPreferences(() => false);
        return () => h("p", String(isLoading.value));
      },
    });
    await serverRender(Hidden);
    expect(reads()).toEqual([]);
  });
});
