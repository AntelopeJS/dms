// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  onMounted,
  ref,
  useTemplateRef,
  watch,
  type App,
  type PropType,
  type Ref,
  type VNode,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_STATUS_TEXT_CLASSES } from "#dms-core/app/utils/menu";
import NavigationMenu from "../layers/dms-layout/app/components/navigation/NavigationMenu.vue";
import SettingsNav from "../layers/dms-layout/app/build/components/pages/settings/shell/SettingsNav.vue";
import {
  type NavBadge,
  useNavBadges,
} from "../layers/dms-ui/app/build/composables/navigation/useNavBadges";

// A navigation badge is drawn in the tone the server counted it with (the
// status pills' soft tints), neutral grey without one, and hidden at zero;
// the count a page publishes live keeps its tone too.

vi.mock("../layers/dms-ui/app/build/components/form/SearchInput.vue", () => ({
  default: defineComponent({ setup: () => () => h("input") }),
}));

let state: Map<string, Ref<unknown>>;
let app: App | undefined;
let host: HTMLDivElement;

const liveBadges = () =>
  state.get("dms-nav-badges") as Ref<Record<string, NavBadge>> | undefined;

beforeEach(() => {
  state = new Map();
  Object.entries({ computed, ref, watch, onMounted, useTemplateRef }).forEach(
    ([key, value]) => vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("usePrefetch", () => ({ prefetchPageLayout: vi.fn() }));
  vi.stubGlobal("stripQueryAndHash", (path: string) => path);
  vi.stubGlobal("MENU_STATUS_TEXT_CLASSES", MENU_STATUS_TEXT_CLASSES);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("useNavBadges", () => {
  it("prefers the count a page published, with its tone", () => {
    const { navBadgeOf, setNavBadge } = useNavBadges();
    const entry = { fullId: "settings.user.security", badge: "1" };

    expect(navBadgeOf(entry)).toEqual({ label: "1", tone: undefined });
    setNavBadge(entry.fullId, "2", "error");
    expect(navBadgeOf(entry)).toEqual({ label: "2", tone: "error" });
    setNavBadge(entry.fullId, "", "error");
    expect(navBadgeOf(entry)).toBeUndefined();
  });

  it("reads the tone the server served next to the badge", () => {
    const { navBadgeOf } = useNavBadges();
    expect(
      navBadgeOf({ fullId: "a", badge: "3", badgeTone: "warning" }),
    ).toEqual({ label: "3", tone: "warning" });
    expect(navBadgeOf({ fullId: "a" })).toBeUndefined();
  });
});

describe("NavigationMenu badges", () => {
  // Renders each entry's badge the way UNavigationMenu hands it over.
  const MenuStub = defineComponent({
    props: {
      items: {
        type: Array as PropType<NavigationMenuItem[][]>,
        required: true,
      },
    },
    setup(props) {
      const renderItem = (item: NavigationMenuItem): VNode =>
        h("div", {
          "data-entry": item.fullId,
          "data-badge": item.badge?.label,
          "data-color": item.badge?.color,
          "data-variant": item.badge?.variant,
        });
      return () => h("nav", props.items.flat().map(renderItem));
    },
  });

  const ITEMS: NavigationMenuItem[] = [
    { label: "Plain", fullId: "pages.plain", to: "/plain", badge: "7" },
    {
      label: "Security",
      fullId: "settings.user.security",
      to: "/security",
      badge: "1",
      badgeTone: "error",
    },
    {
      label: "Notifications",
      fullId: "settings.user.notifications",
      to: "/notifications",
      badge: "4",
      badgeTone: "primary",
    },
  ];

  const badgeOf = (fullId: string) =>
    host.querySelector<HTMLElement>(`[data-entry="${fullId}"]`)!.dataset;

  function mount(): void {
    state.set("dms-permission-preview-session", ref(null));
    state.set("dms-permission-preview-result", ref(null));
    app = createApp(NavigationMenu, { items: ITEMS });
    app.component("UNavigationMenu", MenuStub);
    app.mount(host);
  }

  it("draws a served count in its tone, and a bare one neutral", () => {
    mount();
    expect(badgeOf("pages.plain")).toMatchObject({
      badge: "7",
      color: "neutral",
      variant: "soft",
    });
    expect(badgeOf("settings.user.security")).toMatchObject({
      badge: "1",
      color: "error",
    });
    expect(badgeOf("settings.user.notifications").color).toBe("primary");
  });

  it("follows the live count and tone, and hides the badge at zero", async () => {
    mount();
    const { setNavBadge } = useNavBadges();
    setNavBadge("settings.user.notifications", "3", "warning");
    setNavBadge("settings.user.security", "");
    await Promise.resolve();

    expect(badgeOf("settings.user.notifications")).toMatchObject({
      badge: "3",
      color: "warning",
    });
    expect(badgeOf("settings.user.security").badge).toBeUndefined();
  });
});

describe("SettingsNav badges", () => {
  const page = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    fullId: `settings.user.${id}`,
    displayName: id,
    fullSlug: `/settings/user/${id}`,
    layoutUrl: `/settings/user/${id}/pagelayout`,
    children: {},
    childrenOrders: [],
    ...extra,
  });

  const tree = ref({
    fullId: "",
    children: {
      settings: {
        id: "settings",
        fullId: "settings",
        fullSlug: "/settings",
        displayName: "Settings",
        children: {
          user: {
            id: "user",
            fullId: "settings.user",
            fullSlug: "/settings/user",
            displayName: "Account",
            children: {
              profile: page("profile", { badge: "5" }),
              security: page("security", { badge: "1", badgeTone: "error" }),
              notifications: page("notifications", {
                badge: "4",
                badgeTone: "warning",
              }),
            },
            childrenOrders: ["profile", "security", "notifications"],
          },
        },
        childrenOrders: ["user"],
      },
    },
    childrenOrders: ["settings"],
  });

  const Link = defineComponent({
    props: { to: { type: String, default: "" } },
    setup:
      (props, { slots }) =>
      () =>
        h("a", { "data-to": props.to }, slots.default?.()),
  });

  const trailBadge = (to: string) =>
    host.querySelector(`[data-to="${to}"] span:last-child`) as HTMLElement;

  function mount(): void {
    vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: tree }));
    vi.stubGlobal("useDmsRoute", () => ({ path: "/settings/user/profile" }));
    app = createApp(SettingsNav);
    app.component("DmsLink", Link);
    app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
    app.mount(host);
  }

  it("draws each badge in its tone's soft tint, neutral grey without one", () => {
    mount();
    expect(trailBadge("/settings/user/profile").className).toContain(
      "bg-elevated text-muted",
    );
    const security = trailBadge("/settings/user/security");
    expect(security.textContent?.trim()).toBe("1");
    expect(security.className).toContain("bg-error/12 text-error");
    expect(trailBadge("/settings/user/notifications").className).toContain(
      "bg-warning/12 text-warning",
    );
  });

  it("hides a badge whose live count fell to zero", async () => {
    mount();
    useNavBadges().setNavBadge("settings.user.security", "");
    await Promise.resolve();
    expect(trailBadge("/settings/user/security").textContent?.trim()).toBe(
      "security",
    );
    expect(liveBadges()?.value["settings.user.security"]).toEqual({
      label: "",
    });
  });
});

describe("Security page badge", () => {
  it("publishes what needs attention in the tone the server weighed", async () => {
    const { useSecurityOverview } = await import(
      "../layers/dms-layout/app/build/composables/settings/security/useSecurityOverview"
    );
    vi.stubGlobal("useAuthFetch", () => ({
      $authFetch: vi.fn(async () => ({
        attention: ["backup_codes_low", "backup_codes_unsaved"],
        attentionTone: "error",
      })),
    }));
    await useSecurityOverview().refresh();
    expect(liveBadges()?.value["settings.user.security"]).toEqual({
      label: "2",
      tone: "error",
    });
  });
});
