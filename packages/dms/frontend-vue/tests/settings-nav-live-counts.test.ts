// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick, reactive, ref, type App, type Ref } from "vue";
import { useTableDataChanges } from "../layers/dms-ui/app/composables/table-view/useTableDataChanges";
import { useNavBadges } from "../layers/dms-ui/app/composables/navigation/useNavBadges";
import { useSettingsNavTrails } from "../layers/dms-layout/app/composables/settings/useSettingsNavTrails";
import { useSettingsNavIndicators } from "../layers/dms-layout/app/composables/settings/useSettingsNavIndicators";

vi.mock(
  "../layers/dms-layout/app/composables/settings/security/useSecurityOverview",
  () => ({ useSecurityOverview: () => ({ refresh: async () => {} }) }),
);

const MEMBERS = "settings.user.members";
const INVITES = "settings.user.members.invites";

let states: Map<string, Ref<unknown>>;
let route: { path: string };
let counts: { invites: number };
let authFetch: ReturnType<typeof vi.fn>;
let app: App | undefined;

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((resolve) => setTimeout(resolve));
};

function mountNav(visible: string[]) {
  app = createApp({
    setup() {
      useSettingsNavIndicators(ref(new Set(visible)));
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
}

const calls = (endpoint: string) =>
  authFetch.mock.calls.filter(([url]) => url === endpoint).length;

beforeEach(() => {
  states = new Map();
  route = reactive({ path: "/settings/user/members/invites" });
  counts = { invites: 4 };
  authFetch = vi.fn(async (url: string) => {
    if (url.endsWith("/admin-invites/list")) return { total: counts.invites };
    return {};
  });
  vi.stubGlobal("useDmsState", <T>(key: string, init: () => T): Ref<T> => {
    if (!states.has(key)) states.set(key, ref(init()) as Ref<unknown>);
    return states.get(key) as Ref<T>;
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, count: number) => `${key}:${count}`,
  }));
  vi.stubGlobal("useDmsRoute", () => route);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("useTableDataChanges", () => {
  it("moves the version of the locations whose rows changed only", () => {
    const { notifyTableDataChanged, tableDataVersion } = useTableDataChanges();
    const invites = tableDataVersion(["/api/tables/admin-invites"]);
    const both = tableDataVersion([
      "/api/tables/members",
      "/api/tables/admin-invites",
    ]);
    const before = both.value;

    notifyTableDataChanged("/api/tables/roles");
    expect(both.value).toBe(before);

    notifyTableDataChanged("/api/tables/admin-invites");
    expect(invites.value).toBe("1");
    expect(both.value).not.toBe(before);

    notifyTableDataChanged(undefined);
    expect(invites.value).toBe("1");
  });
});

describe("settings nav counts", () => {
  it("follow an invitation sent from the invitations page, without a navigation", async () => {
    mountNav([MEMBERS, INVITES]);
    await flush();
    const { trails } = useSettingsNavTrails();
    expect(trails.value[INVITES]?.badge).toBe("4");

    // The invite modal closes and the table reads its rows again.
    counts.invites = 5;
    useTableDataChanges().notifyTableDataChanged("/api/tables/admin-invites");
    await flush();
    expect(trails.value[INVITES]?.badge).toBe("5");
  });

  it("follow an invitation accepted from the members list", async () => {
    mountNav([MEMBERS, INVITES]);
    await flush();

    counts.invites = 3;
    useTableDataChanges().notifyTableDataChanged("/api/tables/members");
    await flush();
    expect(useSettingsNavTrails().trails.value[INVITES]?.badge).toBe("3");
  });

  it("leave the members count to the server's navigation badge", async () => {
    mountNav([MEMBERS, INVITES]);
    await flush();

    useTableDataChanges().notifyTableDataChanged("/api/tables/members");
    await flush();
    expect(calls("/api/tables/members/count/batch")).toBe(0);
    expect(useNavBadges().badges.value[MEMBERS]).toBe(undefined);
  });

  it("ask nothing again for another table's changes, nor for hidden entries", async () => {
    mountNav([MEMBERS]);
    await flush();
    expect(calls("/api/tables/admin-invites/list")).toBe(0);

    useTableDataChanges().notifyTableDataChanged("/api/tables/roles");
    useTableDataChanges().notifyTableDataChanged("/api/tables/admin-invites");
    await flush();
    expect(calls("/api/tables/admin-invites/list")).toBe(0);
  });
});
