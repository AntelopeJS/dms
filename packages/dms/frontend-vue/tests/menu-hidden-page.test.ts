import { describe, expect, it } from "vitest";
import { convertSiteLayoutTreeToTreeItems } from "../layers/dms-ui/app/build/types/tree";
import { firstNestedPage } from "../layers/dms-layout/app/build/utils/categoryPages";

// A page the viewer may open but whose every block is hidden from them is
// served out of the menu (`hasAccess: false`, name kept): an Invitations-only
// role got a Members entry that opened on "nothing to show for you". The
// pages nested under it keep their own entries, and opening it leads to the
// first of them.

type TreeNode = NonNullable<
  Parameters<typeof convertSiteLayoutTreeToTreeItems>[0]
>;

interface NodeFixture {
  id: string;
  fullId: string;
  hasAccess?: boolean;
  layoutUrl?: string;
  children?: NodeFixture[];
}

function node({ children = [], ...fixture }: NodeFixture): TreeNode {
  return {
    displayName: fixture.id,
    fullSlug: `/${fixture.fullId.replaceAll(".", "/")}`,
    ...fixture,
    children: Object.fromEntries(
      children.map((child) => [child.id, node(child)]),
    ),
    childrenOrders: children.map((child) => child.id),
  } as unknown as TreeNode;
}

const page = (
  fullId: string,
  hasAccess = true,
  children: NodeFixture[] = [],
) => ({
  id: fullId.split(".").pop()!,
  fullId,
  hasAccess,
  layoutUrl: `/${fullId}/pagelayout`,
  children,
});

function tree(members: NodeFixture, extra: NodeFixture[] = []): TreeNode {
  return node({
    id: "",
    fullId: "",
    children: [
      {
        id: "workspace",
        fullId: "workspace",
        hasAccess: true,
        children: [members, page("workspace.roles"), ...extra],
      },
    ],
  });
}

function sidebarIds(root: TreeNode): string[] {
  const ids = (items: Array<{ fullId?: unknown; children?: unknown }>) =>
    items.flatMap((item): string[] => [
      String(item.fullId),
      ...ids((item.children as typeof items | undefined) ?? []),
    ]);
  return ids(convertSiteLayoutTreeToTreeItems(root).flat());
}

describe("the sidebar", () => {
  it("lists the reachable pages nested under a page left out of it", () => {
    const root = tree(
      page("workspace.members", false, [page("workspace.members.invites")]),
    );
    expect(sidebarIds(root)).toEqual([
      "workspace",
      "workspace.members.invites",
      "workspace.roles",
    ]);
  });

  it("still drops a group left out of it, with what it holds", () => {
    const root = tree(page("workspace.members"), [
      {
        id: "billing",
        fullId: "workspace.billing",
        hasAccess: false,
        children: [page("workspace.billing.invoices")],
      },
    ]);
    expect(sidebarIds(root)).not.toContain("workspace.billing.invoices");
  });
});

describe("a page showing the viewer none of its blocks", () => {
  it("leads to the first page nested under it they can open", () => {
    const root = tree(
      page("workspace.members", false, [
        page("workspace.members.archive", false),
        page("workspace.members.invites"),
      ]),
    );
    expect(firstNestedPage(root, "workspace.members")?.fullId).toBe(
      "workspace.members.invites",
    );
  });

  it("leads nowhere when no nested page is open to them", () => {
    const root = tree(
      page("workspace.members", false, [
        page("workspace.members.invites", false),
      ]),
    );
    expect(firstNestedPage(root, "workspace.members")).toBe(undefined);
    expect(firstNestedPage(root, "workspace.unknown")).toBe(undefined);
  });
});
