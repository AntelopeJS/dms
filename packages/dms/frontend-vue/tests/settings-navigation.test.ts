import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import {
  findActiveSettingsPath,
  INVITES_PAGE_ID,
  useSettingsNavigation,
} from "../layers/dms-layout/app/composables/settings/useSettingsNavigation";

interface NodeFixture {
  fullId: string;
  displayName: string;
  fullSlug: string;
  order?: number;
  layoutUrl?: string;
  hasAccess?: boolean;
  children: Record<string, NodeFixture>;
  childrenOrders: string[];
}

function page(fullId: string, order = 0, hasAccess = true): NodeFixture {
  return {
    fullId,
    displayName: fullId,
    fullSlug: `/${fullId.replaceAll(".", "/")}`,
    order,
    layoutUrl: `/${fullId}/pagelayout`,
    hasAccess,
    children: {},
    childrenOrders: [],
  };
}

function category(
  fullId: string,
  children: NodeFixture[],
  order = 0,
): NodeFixture {
  return {
    fullId,
    displayName: `$${fullId}`,
    fullSlug: `/${fullId.replaceAll(".", "/")}`,
    order,
    children: Object.fromEntries(
      children.map((child) => [child.fullId.split(".").pop()!, child]),
    ),
    childrenOrders: children.map((child) => child.fullId.split(".").pop()!),
  };
}

const tree = ref<NodeFixture | undefined>();

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: tree }));
  tree.value = category("", [
    category("settings", [
      page("settings.settings"),
      category("settings.user", [
        page("settings.user.members", 4),
        page("settings.user.profile", 1),
        page("settings.user.roles", 5),
        page("settings.user.notifications", 2),
        page("settings.user.region", 1),
        page("settings.user.custom", 9),
        page("settings.user.hidden", 3, false),
      ]),
      category("settings.workspace", [page("settings.workspace.billing")]),
      category("settings.crm", [page("settings.crm.pipelines")], 7),
    ]),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("groups account, workspace and other settings categories", () => {
  const { groups } = useSettingsNavigation();
  expect(
    groups.value.map((group) => [
      group.id,
      group.pages.map((entry) => entry.fullId),
    ]),
  ).toEqual([
    [
      "account",
      [
        "settings.user.profile",
        "settings.user.region",
        "settings.user.notifications",
        "settings.user.custom",
      ],
    ],
    [
      "workspace",
      [
        "settings.user.members",
        "settings.user.roles",
        "settings.workspace.billing",
      ],
    ],
    ["settings.crm", ["settings.crm.pipelines"]],
  ]);
});

it("labels the core groups with their i18n keys and others by category", () => {
  const { groups } = useSettingsNavigation();
  expect(groups.value.map((group) => group.label)).toEqual([
    "$page.settings.shell.account",
    "$page.settings.shell.workspace",
    "$settings.crm",
  ]);
});

// Pending invitations: a hidden page (out of the menu tree) the nav lists from
// the site layout's page registry, right after Members.
function invitesRegistryEntry(hasAccess: boolean) {
  return {
    "/settings/user/members/invites": {
      id: "invites",
      fullId: INVITES_PAGE_ID,
      fullSlug: "/settings/user/members/invites",
      displayName: "$menu.invites",
      description: "$page.settings.description.invites",
      icon: "i-ph-envelope-simple",
      layoutUrl: "/settings/user/members/invites/pagelayout",
      hidden: true,
      hasAccess,
    },
  };
}

function stubRegistry(pages: Record<string, unknown>): void {
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayoutTree: tree,
    siteLayout: ref({ pages, categories: {} }),
  }));
}

it("lists pending invitations between members and roles when it can be opened", () => {
  stubRegistry(invitesRegistryEntry(true));
  const { groups } = useSettingsNavigation();
  const workspace = groups.value.find((group) => group.id === "workspace");
  expect(workspace?.pages.map((entry) => entry.fullId)).toEqual([
    "settings.user.members",
    INVITES_PAGE_ID,
    "settings.user.roles",
    "settings.workspace.billing",
  ]);
  expect(workspace?.pages[1]).toMatchObject({
    label: "$page.settings.shell.member_invitations",
    description: "$page.settings.description.invites",
    icon: "i-ph-envelope-simple",
    to: "/settings/user/members/invites",
  });
});

it("leaves pending invitations out for a viewer who cannot open them", () => {
  stubRegistry(invitesRegistryEntry(false));
  const { groups } = useSettingsNavigation();
  expect(
    groups.value.flatMap((group) => group.pages.map((entry) => entry.fullId)),
  ).not.toContain(INVITES_PAGE_ID);
});

it("keeps pending invitations in the workspace group without members", () => {
  stubRegistry(invitesRegistryEntry(true));
  const settings = tree.value!.children.settings!;
  const user = settings.children.user!;
  delete user.children.members;
  user.childrenOrders = user.childrenOrders.filter((id) => id !== "members");
  const { groups } = useSettingsNavigation();
  expect(
    groups.value.find((group) => group.id === "workspace")?.pages[0]?.fullId,
  ).toBe(INVITES_PAGE_ID);
});

it("marks only the most specific settings entry active", () => {
  const paths = [
    "/settings/user/members",
    "/settings/user/members/invites",
    "/settings/user/roles",
  ];
  expect(findActiveSettingsPath("/settings/user/members/invites", paths)).toBe(
    "/settings/user/members/invites",
  );
  expect(findActiveSettingsPath("/settings/user/members", paths)).toBe(
    "/settings/user/members",
  );
  expect(findActiveSettingsPath("/settings/user/members/42/edit", paths)).toBe(
    "/settings/user/members",
  );
  expect(findActiveSettingsPath("/settings/user/rolesx", paths)).toBe(
    undefined,
  );
});
