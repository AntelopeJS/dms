import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useCategoryNavCards } from "../layers/dms-ui/app/entries/composables/navigation/useCategoryNavCards";
import type { NavBadge } from "../layers/dms-ui/app/entries/composables/navigation/useNavBadges";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { engine } from "./helpers/api-data-runtime";
import type { SiteLayoutTree } from "../layers/dms-core/app/types/page";

const badges = () =>
  engine.useDmsState<Record<string, NavBadge>>("dms-nav-badges", () => ({}));

const node = (fullId: string, extra: Partial<SiteLayoutTree> = {}) => ({
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
            notifications: node("settings.user.notifications", {
              badge: "4",
              badgeTone: "warning",
            }),
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
  useRealDataEngine();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: tree }));
  vi.stubGlobal("useDmsState", engine.useDmsState);
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
    badge: undefined,
  });
});

it("shows the navigation badge, a fresher count first", () => {
  badges().value = {
    "settings.user.notifications": { label: "" },
    "settings.user.security": { label: "2", tone: "error" },
  };
  const { cards } = useCategoryNavCards(() => "settings.user");
  expect(cards.value.map((card) => card.badge)).toEqual([
    undefined,
    "2",
    undefined,
  ]);
  expect(cards.value[1]?.badgeTone).toBe("error");
});

it("draws the served badge in the tone the server gave it", () => {
  const { cards } = useCategoryNavCards(() => "settings.user");
  expect(cards.value[2]).toMatchObject({ badge: "4", badgeTone: "warning" });
  expect(cards.value[1]).toMatchObject({ badge: "1", badgeTone: undefined });

  expect(cards.value[2]).not.toHaveProperty("state");
});

it("lists nothing for a category the site layout does not hold", () => {
  const { cards } = useCategoryNavCards(() => "settings.unknown");
  expect(cards.value).toEqual([]);
});
