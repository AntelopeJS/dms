import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useCategoryNavCards } from "../layers/dms-layout/app/build/composables/navigation/useCategoryNavCards";

const badges = ref<Record<string, string>>({});

vi.mock("../layers/dms-ui/app/composables/navigation/useNavBadges", () => ({
  useNavBadges: () => ({ badges }),
}));
vi.mock("../layers/dms-core/app/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({}),
}));

const node = (fullId: string, extra: Record<string, unknown> = {}) => ({
  fullId,
  displayName: `$${fullId}`,
  fullSlug: `/${fullId.replaceAll(".", "/")}`,
  layoutUrl: `/${fullId}/pagelayout`,
  children: {},
  childrenOrders: [],
  ...extra,
});

const tree = ref({
  ...node(""),
  children: {
    settings: {
      ...node("settings"),
      layoutUrl: undefined,
      children: {
        user: {
          ...node("settings.user"),
          layoutUrl: undefined,
          children: {
            profile: node("settings.user.profile", { icon: "i-ph-user" }),
            security: node("settings.user.security", { badge: "1" }),
            notifications: node("settings.user.notifications", { badge: "4" }),
            locked: node("settings.user.locked", { hasAccess: false }),
          },
          childrenOrders: ["profile", "security", "notifications", "locked"],
        },
      },
      childrenOrders: ["user"],
    },
  },
  childrenOrders: ["settings"],
});

beforeEach(() => {
  badges.value = {};
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: tree }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("makes a card of each page the viewer can open, in menu order", () => {
  const { cards } = useCategoryNavCards(() => "settings.user");
  expect(cards.value.map((card) => card.id)).toEqual([
    "settings.user.profile",
    "settings.user.security",
    "settings.user.notifications",
  ]);
  expect(cards.value[0]).toMatchObject({
    title: "$settings.user.profile",
    icon: "i-ph-user",
    to: "/settings/user/profile",
    state: undefined,
  });
});

it("shows the navigation badge, a fresher count first", () => {
  badges.value = {
    "settings.user.notifications": "",
    "settings.user.security": "2",
  };
  const { cards } = useCategoryNavCards(() => "settings.user");
  expect(cards.value.map((card) => card.state)).toEqual([
    undefined,
    "2",
    undefined,
  ]);
});

it("lists nothing for a category the site layout does not hold", () => {
  const { cards } = useCategoryNavCards(() => "settings.unknown");
  expect(cards.value).toEqual([]);
});
