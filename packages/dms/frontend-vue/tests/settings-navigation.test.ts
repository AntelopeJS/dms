import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import {
  findActiveSettingsPath,
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

// The site layout lists a node's children in menu order (`order`, then name):
// the fixture takes them in that order.
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

const withChildren = (node: NodeFixture, children: NodeFixture[]) => ({
  ...node,
  children: Object.fromEntries(
    children.map((child) => [child.fullId.split(".").pop()!, child]),
  ),
  childrenOrders: children.map((child) => child.fullId.split(".").pop()!),
});

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useSiteLayout", () => ({ siteLayoutTree: tree }));
  const settings = category("settings", [
    { ...page("settings.settings"), fullSlug: "/settings" },
    category("settings.user", [
      page("settings.user.profile", 1),
      page("settings.user.region", 2),
      page("settings.user.hidden", 3, false),
      page("settings.user.notifications", 4),
    ]),
    category("settings.workspace", [
      withChildren(page("settings.workspace.members", 1), [
        page("settings.workspace.members.invites"),
      ]),
      page("settings.workspace.roles", 2),
      page("settings.workspace.billing", 3),
    ]),
    category("settings.crm", [page("settings.crm.pipelines")], 7),
    page("settings.loose", 9),
  ]);
  settings.fullSlug = "/settings";
  tree.value = category("", [settings]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("makes a group of each settings category, in menu order", () => {
  const { groups } = useSettingsNavigation();
  expect(
    groups.value.map((group) => [
      group.id,
      group.pages.map((entry) => entry.fullId),
    ]),
  ).toEqual([
    [
      "settings.user",
      [
        "settings.user.profile",
        "settings.user.region",
        "settings.user.notifications",
      ],
    ],
    [
      "settings.workspace",
      [
        "settings.workspace.members",
        "settings.workspace.members.invites",
        "settings.workspace.roles",
        "settings.workspace.billing",
      ],
    ],
    ["settings.crm", ["settings.crm.pipelines"]],
    ["settings", ["settings.loose"]],
  ]);
});

it("labels each group with its category's name", () => {
  const { groups } = useSettingsNavigation();
  expect(groups.value.map((group) => group.label)).toEqual([
    "$settings.user",
    "$settings.workspace",
    "$settings.crm",
    "$settings",
  ]);
});

it("leaves out the overview and the pages the viewer cannot open", () => {
  const { groups } = useSettingsNavigation();
  const listed = groups.value.flatMap((group) =>
    group.pages.map((entry) => entry.fullId),
  );
  expect(listed).not.toContain("settings.settings");
  expect(listed).not.toContain("settings.user.hidden");
});

it("carries each page's badge and status to its entry", () => {
  const settings = tree.value!.children.settings!;
  Object.assign(settings.children.user!.children.region!, {
    badge: "3",
    status: "warning",
  });
  const { groups } = useSettingsNavigation();
  expect(groups.value[0]?.pages[1]).toMatchObject({ badge: "3", status: "warning" });
});

it("marks only the most specific settings entry active", () => {
  const paths = [
    "/settings/workspace/members",
    "/settings/workspace/members/invites",
    "/settings/workspace/roles",
  ];
  expect(findActiveSettingsPath("/settings/workspace/members/invites", paths)).toBe(
    "/settings/workspace/members/invites",
  );
  expect(findActiveSettingsPath("/settings/workspace/members", paths)).toBe(
    "/settings/workspace/members",
  );
  expect(findActiveSettingsPath("/settings/workspace/members/42/edit", paths)).toBe(
    "/settings/workspace/members",
  );
  expect(findActiveSettingsPath("/settings/workspace/rolesx", paths)).toBe(
    undefined,
  );
});
