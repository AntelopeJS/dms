/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  effectScope,
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
import SettingsNav from "../layers/dms-layout/app/entries/components/pages/settings/shell/SettingsNav";
import type { SiteLayoutTree } from "../layers/dms-core/app/types/page";
import { useNavBadges } from "../layers/dms-ui/app/entries/composables/navigation/useNavBadges";

let state: Map<string, Ref<unknown>>;
let app: App | undefined;
let host: HTMLDivElement;

// SAFETY: useNavBadges owns this state key and initializes it to the NavBadge dictionary read by these assertions.
const liveBadges = () =>
  state.get("dms-nav-badges") as
    | ReturnType<typeof useNavBadges>["badges"]
    | undefined;

beforeEach(() => {
  vi.stubGlobal("defineShortcuts", () => {});
  vi.stubGlobal("useDmsCookie", () => ref("other"));
  state = new Map();
  Object.entries({ computed, ref, watch, onMounted, useTemplateRef }).forEach(
    ([key, value]) => vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useDmsState", <T>(key: string, initial: () => T) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
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

describe("the counts a page visit carries", () => {
  it("draws each one, over a static badge", () => {
    const { navBadgeOf, applyCountedNavBadges } = useNavBadges();
    applyCountedNavBadges({
      "settings.user.notifications": { badge: "4", tone: "error" },
    });
    expect(
      navBadgeOf({ fullId: "settings.user.notifications", badge: "new" }),
    ).toEqual({ label: "4", tone: "error" });
  });

  it("drops the badge of an entry the next visit no longer counts", () => {
    const { navBadgeOf, applyCountedNavBadges } = useNavBadges();
    applyCountedNavBadges({
      "settings.user.notifications": { badge: "4" },
      "settings.workspace.invites": { badge: "2" },
    });
    applyCountedNavBadges({ "settings.workspace.invites": { badge: "1" } });

    expect(
      navBadgeOf({ fullId: "settings.user.notifications" }),
    ).toBeUndefined();
    expect(navBadgeOf({ fullId: "settings.workspace.invites" })).toEqual({
      label: "1",
    });
  });

  it("leaves the badges alone when a visit carries none, such as a frontend page", () => {
    const { navBadgeOf, applyCountedNavBadges } = useNavBadges();
    applyCountedNavBadges({ "settings.user.notifications": { badge: "4" } });
    applyCountedNavBadges(undefined);
    expect(navBadgeOf({ fullId: "settings.user.notifications" })).toEqual({
      label: "4",
    });
  });
});

const MenuStub = defineComponent({
  props: {
    items: {
      // SAFETY: NavigationMenu supplies groups of Nuxt UI navigation items to this array prop.
      type: Array as PropType<NavigationMenuItem[][]>,
      required: true,
    },
  },
  setup(props, { slots }) {
    const renderItem = (item: NavigationMenuItem): VNode =>
      h(
        "div",
        {
          "data-entry": item.fullId,
          "data-badge": item.badge?.label,
          "data-color": item.badge?.color,
          "data-variant": item.badge?.variant,
          "data-prefetch": String(item.prefetch),
          "data-trailing-icon": item.trailingIcon,
        },
        [
          slots["item-leading"]?.({
            item,
            active: item.active,
            ui: { linkLeadingIcon: () => "size-4" },
          }),
          ...(item.children?.map(renderItem) ?? []),
        ],
      );
    return () => h("nav", props.items.flat().map(renderItem));
  },
});

describe("NavigationMenu badges", () => {
  const ITEMS = [
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
  ] satisfies NavigationMenuItem[];

  const badgeOf = (fullId: string) =>
    host.querySelector<HTMLElement>(`[data-entry="${fullId}"]`)!.dataset;

  function mount(items = ITEMS): void {
    state.set("dms-permission-preview-session", ref(null));
    state.set("dms-permission-preview-result", ref(null));
    app = createApp(NavigationMenu, { items });
    app.component("UNavigationMenu", MenuStub);
    app.component(
      "UIcon",
      defineComponent({
        props: ["name"],
        setup: (props) => () => h("i", { "data-icon": props.name }),
      }),
    );
    app.component(
      "UChip",
      defineComponent({
        props: ["color"],
        setup:
          (props, { slots }) =>
          () =>
            h("span", { "data-chip-color": props.color }, slots.default?.()),
      }),
    );
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

  it("lets Inertia prefetch each linked page on hover, with no fetch of its own", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("$fetch", fetch);
    mount();
    for (const item of ITEMS)
      expect(badgeOf(item.fullId).prefetch).toBe("true");
    host
      .querySelector("nav")!
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(fetch).not.toHaveBeenCalled();
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

  it("puts parent status on the leading icon while leaves retain a trailing dot or badge", () => {
    mount([
      {
        fullId: "project",
        label: "Project",
        icon: "i-ph-folder",
        status: "success",
        children: [
          { fullId: "project.api", label: "API", status: "warning" },
          {
            fullId: "project.more",
            label: "More",
            status: "error",
            badge: "+3",
          },
        ],
      },
    ]);
    expect(
      host.querySelector(
        '[data-chip-color="success"] [data-icon="i-ph-folder"]',
      ),
    ).not.toBeNull();
    expect(badgeOf("project").trailingIcon).toBeUndefined();
    expect(badgeOf("project.api").trailingIcon).toBe("i-ph-circle-fill");
    expect(badgeOf("project.more").trailingIcon).toBeUndefined();
    expect(badgeOf("project.more").badge).toBe("+3");
  });
});

describe("SettingsNav badges", () => {
  const page = (id: string, extra: Partial<SiteLayoutTree> = {}) => ({
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
    host.querySelector<HTMLElement>(`[data-to="${to}"] span:last-child`)!;

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
      "../layers/dms-layout/app/entries/composables/settings/security/useSecurityOverview"
    );
    const { engine, browserRuntime } = await import(
      "./helpers/api-data-runtime"
    );
    const { useApiData } = await import(
      "../layers/dms-core/app/composables/auth/useApiData"
    );
    vi.stubGlobal("useDmsAsyncData", engine.useDmsAsyncData);
    vi.stubGlobal("useDmsFetch", engine.useDmsFetch);
    vi.stubGlobal("useApiData", useApiData);
    vi.stubGlobal("useAuthFetch", () => ({
      $authFetch: vi.fn(async () => ({
        attention: ["backup_codes_low", "backup_codes_unsaved"],
        attentionTone: "error",
      })),
    }));
    browserRuntime();
    const scope = effectScope();
    const overview = scope.run(() => useSecurityOverview())!;
    await overview.refresh();
    scope.stop();
    expect(liveBadges()?.value["settings.user.security"]).toEqual({
      label: "2",
      tone: "error",
    });
  });
});
