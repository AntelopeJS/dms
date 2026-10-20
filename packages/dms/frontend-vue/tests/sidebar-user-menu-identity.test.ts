// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
  type App,
} from "vue";
import SidebarUserMenu from "../layers/dms-layout/app/build/components/layout/SidebarUserMenu.vue";
import type { User } from "../layers/dms-core/app/types/user";

const FIRST_KEY = "avatars/first";
const SECOND_KEY = "avatars/second";
const READ_URLS: Record<string, string> = {
  [FIRST_KEY]: "https://files.test/first.png",
  [SECOND_KEY]: "https://files.test/second.png",
};

const user = ref<Partial<User> | null>(null);
const resolved = ref<Record<string, string>>({});
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
  vi.stubGlobal("useCurrentUser", () => ({ user, refresh: vi.fn() }));
  vi.stubGlobal("useLogout", () => ({ logout: vi.fn() }));
  vi.stubGlobal("useColorModePreference", () => ref("system"));
  vi.stubGlobal("useUniqueLocales", () => ({ uniqueLocales: ref([]) }));
  vi.stubGlobal("useUserLanguage", () => ({ changeLanguage: vi.fn() }));
  vi.stubGlobal("ACCOUNT_MENU_ENTRIES", []);
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
      setup:
        (_, { slots }) =>
        () =>
          h("div", [slots.default?.(), slots["content-top"]?.()]),
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
