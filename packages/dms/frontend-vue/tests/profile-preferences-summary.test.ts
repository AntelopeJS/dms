// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import {
  buildAccessSummary,
  buildAppearanceSummary,
  buildNotificationsSummary,
  buildRegionSummary,
  resolvePreferenceRows,
  type SummaryTranslate,
  tallySubjects,
  weekdayName,
} from "../layers/dms-layout/app/build/composables/settings/profile/preferencesSummary";
import type { NotificationSubject } from "../layers/dms-layout/app/build/composables/notification/useNotificationCatalog";
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from "../layers/dms-ui/app/build/utils/accessibilityPreferences";

const KEY = "page.settings.profile.preferences";

// A tiny en-GB catalog: enough to read the sentences the rows would show.
const MESSAGES: Record<string, string> = {
  access_roles: "Role: {roles} | Roles: {roles}",
  access_no_role: "No role in this workspace",
  access_workspace_owner: "workspace owner",
  access_platform_owner: "platform owner, full access",
  access_platform_owner_alone: "Platform owner, full access",
  access_workspace_owner_alone: "Workspace owner, no role",
  access_unavailable: "Your roles couldn't be loaded.",
  region_summary:
    "{language} · {zone}: dates {date}, {clock}, weeks start on {weekday}",
  clock_h23: "24-hour time",
  clock_h12: "12-hour time",
  notifications_unread:
    "No unread notifications | {count} unread notification | {count} unread notifications",
  notifications_subjects: "{on} of {total} subjects on",
  notifications_email_soon: "email coming soon",
  theme_light: "Light theme",
  theme_dark: "Dark theme",
  theme_system_light: "System theme (light now)",
  theme_system_dark: "System theme (dark now)",
  density_small: "compact density",
  density_normal: "normal density",
  density_large: "large density",
  accessibility_on: "{options} on",
  a11y_reduce_motion: "reduced motion",
  a11y_increase_contrast: "increased contrast",
  a11y_underline_links: "underlined links",
};

/** vue-i18n's plural choice: 2 forms are one|other, 3 are zero|one|other. */
function pickPlural(forms: string[], count?: number): string {
  if (count === undefined || forms.length === 1) return forms[0]!;
  if (forms.length === 2) return forms[count === 1 ? 0 : 1]!;
  return forms[Math.min(count, 2)]!;
}

const t: SummaryTranslate = (key, params = {}, plural) => {
  const message = MESSAGES[key.replace(`${KEY}.`, "")];
  if (message === undefined) return key;
  const form = pickPlural(message.split(" | "), plural);
  return form.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params[name] ?? `{${name}}`),
  );
};

const subject = (
  id: string,
  extra: Partial<NotificationSubject> = {},
): NotificationSubject => ({
  id,
  labelKey: id,
  category: { id: "core", labelKey: "core", icon: "i-ph-bell" },
  ...extra,
});

describe("summary sentences", () => {
  it("lists the roles and says who owns the workspace", () => {
    expect(
      buildAccessSummary(t, {
        roles: ["Admin", "Finance"],
        workspaceOwner: true,
        platformOwner: false,
      }),
    ).toBe("Roles: Admin, Finance · workspace owner");
    expect(
      buildAccessSummary(t, {
        roles: ["Editor"],
        workspaceOwner: false,
        platformOwner: false,
      }),
    ).toBe("Role: Editor");
    expect(
      buildAccessSummary(t, {
        roles: [],
        workspaceOwner: true,
        platformOwner: true,
      }),
    ).toBe("Platform owner, full access");
    expect(
      buildAccessSummary(t, {
        roles: [],
        workspaceOwner: true,
        platformOwner: false,
      }),
    ).toBe("Workspace owner, no role");
    expect(
      buildAccessSummary(t, {
        roles: ["Admin"],
        workspaceOwner: true,
        platformOwner: true,
      }),
    ).toBe("Role: Admin · platform owner, full access");
  });

  it("writes the regional settings as they apply", () => {
    const facts = {
      language: "Français",
      timeZone: "Europe / Brussels",
      date: "03/10/2026",
      timeFormat: "h23" as const,
      weekStart: 1,
      locale: "en-GB",
    };
    expect(buildRegionSummary(t, facts)).toBe(
      "Français · Europe / Brussels: dates 03/10/2026, 24-hour time, weeks start on Monday",
    );
    expect(
      buildRegionSummary(t, { ...facts, timeFormat: "h12", weekStart: 0 }),
    ).toContain("12-hour time, weeks start on Sunday");
    expect(weekdayName("fr-FR", 1)).toBe("lundi");
    expect(weekdayName("en-GB", 6)).toBe("Saturday");
  });

  it("counts locked subjects as on and leaves out a tally that did not load", () => {
    const subjects = [
      subject("a"),
      subject("b"),
      subject("c", { locked: true }),
      subject("d"),
    ];
    const off = new Set(["b", "c", "d"]);
    const tally = tallySubjects(subjects, (s) => !off.has(s.id));
    expect(tally).toEqual({ on: 2, total: 4 });
    expect(buildNotificationsSummary(t, 3, tally)).toBe(
      "3 unread notifications · 2 of 4 subjects on · email coming soon",
    );
    expect(buildNotificationsSummary(t, 1, tally)).toMatch(
      /^1 unread notification ·/,
    );
    expect(buildNotificationsSummary(t, 0)).toBe(
      "No unread notifications · email coming soon",
    );
  });

  it("names the theme, the density and only the accessibility options that are on", () => {
    const base = {
      theme: "dark" as const,
      systemDark: false,
      scale: "normal" as const,
      accessibility: { ...DEFAULT_ACCESSIBILITY_PREFERENCES },
      locale: "en-GB",
    };
    expect(buildAppearanceSummary(t, base)).toBe("Dark theme · normal density");
    expect(
      buildAppearanceSummary(t, {
        ...base,
        theme: "system",
        systemDark: true,
        scale: "small",
        accessibility: {
          reduceMotion: "on",
          increaseContrast: true,
          underlineLinks: false,
        },
      }),
    ).toBe(
      "System theme (dark now) · compact density · reduced motion and increased contrast on",
    );
    // "Automatic" motion follows the system: not an option the user turned on.
    expect(
      buildAppearanceSummary(t, {
        ...base,
        accessibility: { ...base.accessibility, reduceMotion: "auto" },
      }),
    ).not.toContain(" on");
  });
});

describe("access gating", () => {
  it("shows a personal row only when its page opens, and the roles button only with the roles page", () => {
    const rows = resolvePreferenceRows(
      new Map([
        ["settings.user.region", "/settings/user/region"],
        ["settings.user.appearance", "/settings/user/appearance"],
      ]),
    );
    expect(rows.access).toEqual({ visible: true, to: undefined });
    expect(rows.region).toEqual({
      visible: true,
      to: "/settings/user/region",
    });
    expect(rows.notifications.visible).toBe(false);
    expect(rows.appearance.visible).toBe(true);

    const withRoles = resolvePreferenceRows(
      new Map([["settings.workspace.roles", "/settings/workspace/roles"]]),
    );
    expect(withRoles.access).toEqual({
      visible: true,
      to: "/settings/workspace/roles",
    });
  });
});

// The section itself: its composable with every data source stubbed.
const navPages = ref<{ fullId: string; to: string }[]>([]);
const unreadCount = ref(0);
const bellPending = ref(true);
const preferencesLoading = ref(true);
const colorMode = ref<"light" | "dark" | "system">("dark");
const prefersDark = ref(false);
let authFetch: ReturnType<typeof vi.fn>;
let resolveAccess: (value: unknown) => void;
const loadPreferences = vi.fn(async () => {});

vi.mock("@vueuse/core", () => ({ usePreferredDark: () => prefersDark }));
vi.mock("#dms-ui/app/components/icon-well/IconWell.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: { icon: String, tone: String },
      setup: (props) => () =>
        h("span", { "data-icon": props.icon, "data-tone": props.tone }),
    }),
  };
});
vi.mock("../layers/dms-layout/app/composables/page/useIsOwner", async () => {
  const { computed } = await import("vue");
  return { useIsOwner: () => computed(() => false) };
});
vi.mock(
  "#dms-core/app/composables/user/useUserRegionalPreferences",
  async () => {
    const { ref } = await import("vue");
    return {
      useUserRegionalPreferences: () => ({
        preferences: ref({}),
        timeZone: ref("Europe/Brussels"),
        timeFormat: ref("h23"),
        weekStartsOn: ref(1),
      }),
    };
  },
);
vi.mock("#dms-core/app/composables/translation/useUniqueLocales", async () => {
  const { ref } = await import("vue");
  return {
    useUniqueLocales: () => ({
      uniqueLocales: ref([{ code: "en-GB", name: "English" }]),
    }),
  };
});
vi.mock("#dms-core/app/utils/formatter", () => ({
  formatDate: () => "03/10/2026",
}));
vi.mock(
  "../layers/dms-layout/app/build/composables/settings/useSettingsNavigation",
  async () => {
    const { computed } = await import("vue");
    return {
      useSettingsNavigation: () => ({
        groups: computed(() => [{ id: "account", pages: navPages.value }]),
      }),
    };
  },
);
vi.mock(
  "../layers/dms-layout/app/composables/notification/useNotifications",
  () => ({
    useNotifications: () => ({
      unreadCount,
      areCountsLoaded: {
        get value() {
          return !bellPending.value;
        },
      },
    }),
  }),
);
vi.mock(
  "../layers/dms-layout/app/build/composables/notification/useNotificationCatalog",
  async () => {
    const { ref } = await import("vue");
    return {
      useNotificationCatalog: () => ({
        subjects: ref([
          { id: "a", category: { id: "core" } },
          { id: "b", category: { id: "core" }, locked: true },
          { id: "c", category: { id: "core" } },
        ]),
      }),
    };
  },
);
vi.mock(
  "../layers/dms-layout/app/build/composables/notification/useNotificationPreferences",
  async () => {
    const { ref } = await import("vue");
    return {
      useNotificationPreferences: () => ({
        isLoading: preferencesLoading,
        loadFailed: ref(false),
        isEnabled: (s: { id: string }) => s.id !== "c",
        load: loadPreferences,
      }),
    };
  },
);
vi.mock(
  "../layers/dms-layout/app/composables/general/useColorModePreference",
  () => ({ useColorModePreference: () => colorMode }),
);
vi.mock(
  "../layers/dms-layout/app/composables/general/useInterfaceScale",
  async () => {
    const { ref } = await import("vue");
    return { useInterfaceScale: () => ref("normal") };
  },
);
vi.mock(
  "../layers/dms-layout/app/composables/general/useAccessibilityPreferences",
  async () => {
    const { ref } = await import("vue");
    return {
      useAccessibilityPreferences: () => ({
        preferences: ref({
          reduceMotion: "auto",
          increaseContrast: true,
          underlineLinks: false,
        }),
      }),
    };
  },
);

let app: App | undefined;
let host: HTMLDivElement;

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
};

async function mountSection(): Promise<void> {
  const { default: ProfilePreferencesSummary } = await import(
    "../layers/dms-layout/app/build/components/pages/settings/profile/ProfilePreferencesSummary.vue"
  );
  app = createApp(ProfilePreferencesSummary);
  app.component(
    "USkeleton",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("span", { "data-skeleton": "" }, slots.default?.()),
    }),
  );
  app.component(
    "UButton",
    defineComponent({
      props: { to: String, label: String },
      setup: (props) => () => h("a", { href: props.to }, props.label),
    }),
  );
  app.mount(host);
  await flush();
}

const rowTexts = () =>
  [...host.querySelectorAll(":scope > div > div")].map(
    (row) => row.textContent,
  );
const skeletonRows = () =>
  [...host.querySelectorAll(":scope > div > div")].filter((row) =>
    row.querySelector("[data-skeleton]"),
  ).length;
const buttons = () =>
  [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));

beforeEach(() => {
  navPages.value = [
    { fullId: "settings.user.region", to: "/settings/user/region" },
    {
      fullId: "settings.user.notifications",
      to: "/settings/user/notifications",
    },
    { fullId: "settings.user.appearance", to: "/settings/user/appearance" },
  ];
  unreadCount.value = 0;
  bellPending.value = true;
  preferencesLoading.value = true;
  colorMode.value = "dark";
  prefersDark.value = false;
  loadPreferences.mockClear();
  authFetch = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveAccess = resolve;
      }),
  );
  vi.stubGlobal("useI18n", () => ({ t, locale: ref("en-GB") }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("Preferences & access section", () => {
  it("holds skeletons while the data loads, never a false 0 unread, with the buttons already there", async () => {
    await mountSection();
    // Access and notifications wait for their data; region and appearance
    // were written at mount.
    expect(skeletonRows()).toBe(2);
    // The skeleton is shaped from a sample sentence, blanked: its words'
    // lengths stay, no sample count is ever in the page.
    expect(rowTexts()[2]).not.toMatch(/unread|[0-9]/);
    expect(host.textContent).toContain(
      "x xxxxxx xxxxxxxxxxxxx · x xx x xxxxxxxx xx",
    );
    expect(buttons()).toEqual([
      "/settings/user/region",
      "/settings/user/notifications",
      "/settings/user/appearance",
    ]);
    expect(loadPreferences).toHaveBeenCalledOnce();

    // The preferences answer first: still a skeleton until the bell's count.
    preferencesLoading.value = false;
    await flush();
    expect(skeletonRows()).toBe(2);

    unreadCount.value = 3;
    bellPending.value = false;
    resolveAccess({
      roles: ["Admin"],
      workspaceOwner: true,
      platformOwner: false,
    });
    await flush();
    expect(skeletonRows()).toBe(0);
    expect(rowTexts()).toEqual([
      expect.stringContaining("Role: Admin · workspace owner"),
      expect.stringContaining(
        "English · Europe / Brussels: dates 03/10/2026, 24-hour time, weeks start on Monday",
      ),
      expect.stringContaining(
        "3 unread notifications · 2 of 3 subjects on · email coming soon",
      ),
      expect.stringContaining(
        "Dark theme · normal density · increased contrast on",
      ),
    ]);
    // Unread notifications turn the bell amber.
    expect(
      host
        .querySelector("[data-icon='i-ph-bell-ringing']")
        ?.getAttribute("data-tone"),
    ).toBe("warning");
  });

  it("hides the rows of pages the user cannot open and keeps Your access informative", async () => {
    navPages.value = [];
    await mountSection();
    expect(host.querySelectorAll(":scope > div > div")).toHaveLength(1);
    expect(buttons()).toEqual([]);
    expect(loadPreferences).not.toHaveBeenCalled();

    resolveAccess({ roles: [], workspaceOwner: false, platformOwner: false });
    await flush();
    expect(rowTexts()[0]).toContain("No role in this workspace");
  });

  it("links Your access to the roles page when it opens", async () => {
    navPages.value = [
      { fullId: "settings.workspace.roles", to: "/settings/workspace/roles" },
    ];
    await mountSection();
    expect(buttons()).toEqual(["/settings/workspace/roles"]);
  });

  it("says the roles could not be loaded rather than spinning forever", async () => {
    authFetch = vi.fn(async () => {
      throw new Error("403");
    });
    await mountSection();
    expect(rowTexts()[0]).toContain("Your roles couldn't be loaded.");
  });

  it("resolves a system theme in the browser", async () => {
    colorMode.value = "system";
    prefersDark.value = true;
    await mountSection();
    expect(rowTexts()[3]).toContain("System theme (dark now)");
  });
});
