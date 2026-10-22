// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  watch,
  type App,
} from "vue";
import SidebarUserMenu from "../layers/dms-layout/app/build/components/layout/SidebarUserMenu.vue";
import type { User } from "../layers/dms-core/app/types/user";
import {
  ACCOUNT_MENU_ENTRIES,
  SETTINGS_ROUTE,
} from "../layers/dms-layout/app/utils/account-menu";

interface MenuItemStub {
  to?: string;
  onSelect?: () => void;
}

const FIRST_KEY = "avatars/first";
const SECOND_KEY = "avatars/second";
const READ_URLS: Record<string, string> = {
  [FIRST_KEY]: "https://files.test/first.png",
  [SECOND_KEY]: "https://files.test/second.png",
};

const user = ref<Partial<User> | null>(null);
const route = reactive({ path: "/", query: {} });
const resolved = ref<Record<string, string>>({});
const states = new Map<string, ReturnType<typeof ref>>();
let menuItems: MenuItemStub[][] = [];
let app: App;
let host: HTMLDivElement;

function installRuntime(): void {
  Object.entries({ computed, ref, watch }).forEach(([key, value]) =>
    vi.stubGlobal(key, value),
  );
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("SETTINGS_ROUTE", SETTINGS_ROUTE);
  vi.stubGlobal("useCurrentUser", () => ({ user, refresh: vi.fn() }));
  vi.stubGlobal("useLogout", () => ({ logout: vi.fn() }));
  vi.stubGlobal("useColorModePreference", () => ref("system"));
  vi.stubGlobal("useUniqueLocales", () => ({ uniqueLocales: ref([]) }));
  vi.stubGlobal("useUserLanguage", () => ({ changeLanguage: vi.fn() }));
  vi.stubGlobal("ACCOUNT_MENU_ENTRIES", ACCOUNT_MENU_ENTRIES);
  vi.stubGlobal("useDmsCookie", () => ref(false));
  vi.stubGlobal("useDmsState", (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()));
    return states.get(key);
  });
  vi.stubGlobal("useFileReadUrls", () => ({
    getUrl: (key: string) => resolved.value[key],
    resolve: async (key: string) => {
      resolved.value = { ...resolved.value, [key]: READ_URLS[key]! };
    },
  }));
}

function mount(): void {
  app = createApp(SidebarUserMenu);
  app.component(
    "UDropdownMenu",
    defineComponent({
      props: { items: Array },
      setup:
        (props, { slots }) =>
        () => {
          menuItems = props.items as MenuItemStub[][];
          return h("div", [slots.default?.(), slots["content-top"]?.()]);
        },
    }),
  );
  app.component(
    "UAvatar",
    defineComponent({
      props: { src: String, alt: String },
      setup: (props) => () =>
        h("span", { "data-avatar": props.src ?? "", "data-alt": props.alt }),
    }),
  );
  app.component("UIcon", defineComponent({ render: () => null }));
  app.mount(host);
}

const avatarSources = (): string[] =>
  [...host.querySelectorAll("[data-avatar]")].map(
    (element) => element.getAttribute("data-avatar") ?? "",
  );

beforeEach(() => {
  installRuntime();
  resolved.value = {};
  route.path = "/";
  states.clear();
  menuItems = [];
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("shows the saved picture and follows a refreshed session user", async () => {
  user.value = {
    name: "Ada",
    email: "ada@example.test",
    avatar: { key: FIRST_KEY },
  };
  mount();
  await nextTick();
  expect(avatarSources()).toEqual([READ_URLS[FIRST_KEY], READ_URLS[FIRST_KEY]]);

  user.value = {
    name: "Ada Lovelace",
    email: "ada.lovelace@example.test",
    avatar: { key: SECOND_KEY },
  };
  await nextTick();
  await nextTick();
  expect(avatarSources()).toEqual([
    READ_URLS[SECOND_KEY],
    READ_URLS[SECOND_KEY],
  ]);
  expect(host.textContent).toContain("Ada Lovelace");
  expect(host.textContent).toContain("ada.lovelace@example.test");
});

it("falls back to initials without a picture", async () => {
  user.value = { name: "Ada", email: "ada@example.test", avatar: null };
  mount();
  await nextTick();
  expect(avatarSources()).toEqual(["", ""]);
});

// The settings have no sidebar entry: the menu that opens them shows the user
// where they are.
it.each([
  ["/settings", true],
  ["/settings/workspace/roles", true],
  ["/settings-archive", false],
  ["/", false],
])("draws the trigger active on %s: %s", async (path, isActive) => {
  user.value = { name: "Ada", email: "ada@example.test", avatar: null };
  route.path = path;
  mount();
  await nextTick();
  const trigger = host.querySelector("button")!;
  expect(trigger.hasAttribute("data-active")).toBe(isActive);
  expect(trigger.classList.contains("bg-elevated")).toBe(isActive);
});

// The menu content renders in a portal, outside the sidebar whose link clicks
// close the phone drawer.
it.each(ACCOUNT_MENU_ENTRIES.map((entry) => [entry.to]))(
  "closes the phone drawer when %s is chosen",
  async (to) => {
    user.value = { name: "Ada", email: "ada@example.test", avatar: null };
    mount();
    await nextTick();
    const drawerOpen = states.get("dms-sidebar-open")!;
    drawerOpen.value = true;

    menuItems.flat().find((item) => item.to === to)!.onSelect!();

    expect(drawerOpen.value).toBe(false);
  },
);
