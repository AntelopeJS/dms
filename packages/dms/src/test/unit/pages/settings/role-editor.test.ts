import { expect } from "chai";
import type {
  Role,
  TenantMember,
  UserInvite,
} from "@antelopejs/interface-dms/db";
import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import {
  collectPermissionIds,
  countKnownPermissions,
  countRoleHolders,
  mapRoleEditorTree,
  orderRoleEditorTree,
  replaceRoleReference,
  type RoleEditorPermissionNode,
  ROLE_MEMBER_PREVIEW_LIMIT,
  summarizeOwners,
  summarizeRoles,
} from "../../../../pages/settings/users/role-editor";
import { mapPermissionTreeToPermissionNodes } from "../../../../pages/settings/users/permission-tree-nodes";

const NOW = new Date("2026-06-01T00:00:00Z");
const TOMORROW = new Date("2026-06-02T00:00:00Z");
const YESTERDAY = new Date("2026-05-31T00:00:00Z");

function role(id: string, name: string, permissions: string[]): Role {
  return { _id: id, name, permissions } as Role;
}

function member(
  userId: string,
  roleIds: string[],
  isTenantOwner = false,
): TenantMember {
  return { _id: `t:${userId}`, userId, roleIds, isTenantOwner } as TenantMember;
}

function invite(rolesIds: string[], expiresAt: Date): UserInvite {
  return {
    _id: `i:${rolesIds.join()}`,
    roles_ids: rolesIds,
    expiresAt,
  } as UserInvite;
}

describe("[unit] pages/settings/users/role-editor", () => {
  describe("mapRoleEditorTree", () => {
    it("keeps descriptions and dependencies and lifts unregistered ids", () => {
      const tree: Record<string, PermissionTree> = {
        sales: {
          children: {
            orders: {
              data: {
                id: "sales.orders",
                title: "Orders",
                description: "See orders",
              },
              children: {
                edit: {
                  data: {
                    id: "sales.orders.edit",
                    title: "Edit",
                    dependencies: ["sales.orders"],
                  },
                  children: {},
                },
              },
            },
          },
        },
      };

      const [orders] = mapRoleEditorTree(tree);

      expect(orders.id).to.equal("sales.orders");
      expect(orders.description).to.equal("See orders");
      expect(orders.children?.[0].dependencies).to.deep.equal(["sales.orders"]);
      expect(collectPermissionIds([orders])).to.deep.equal([
        "sales.orders",
        "sales.orders.edit",
      ]);
    });

    it("offers the same nodes, in the same shape, as the original roles form", () => {
      const permission = (id: string, extra = {}) => ({
        data: { id, title: id, ...extra },
        children: {},
      });
      const tree: Record<string, PermissionTree> = {
        pages: {
          ...permission("pages"),
          children: {
            form: {
              ...permission("pages.form"),
              children: {
                simple: {
                  ...permission("pages.form.simple"),
                  children: { form: permission("pages.form.simple.form") },
                },
                public: {
                  ...permission("pages.form.public", { defaultGranted: true }),
                  children: { form: permission("pages.form.public.form") },
                },
              },
            },
          },
        },
        settings: {
          ...permission("settings"),
          children: {
            user: {
              ...permission("settings.user"),
              children: {
                roles: {
                  ...permission("settings.workspace.roles"),
                  children: {
                    table: {
                      ...permission("settings.workspace.roles.table"),
                      children: {
                        list: permission("settings.workspace.roles.table.list"),
                      },
                    },
                  },
                },
              },
            },
          },
        },
        media: { children: { upload: permission("media.upload") } },
      };
      type Shape = { id: string; children?: Shape[] };
      const shape = (nodes: Shape[]): Shape[] =>
        nodes.map((node) => ({
          id: node.id,
          children: node.children && shape(node.children),
        }));

      expect(shape(mapRoleEditorTree(tree))).to.deep.equal(
        shape(mapPermissionTreeToPermissionNodes(tree)),
      );
      expect(collectPermissionIds(mapRoleEditorTree(tree))).to.deep.equal([
        "pages",
        "pages.form",
        "pages.form.simple",
        "pages.form.simple.form",
        "settings",
        "settings.user",
        "settings.workspace.roles",
        "settings.workspace.roles.table",
        "settings.workspace.roles.table.list",
        "media.upload",
      ]);
    });
  });

  describe("orderRoleEditorTree", () => {
    const node = (id: string, children?: RoleEditorPermissionNode[]) => ({
      id,
      label: id,
      children,
    });
    const ids = (nodes: RoleEditorPermissionNode[]): unknown[] =>
      nodes.map((entry) =>
        entry.children ? [entry.id, ids(entry.children)] : entry.id,
      );

    it("lists menu entries in menu order, every level down, settings last", () => {
      const tree = [
        node("settings", [node("settings.user")]),
        node("pages", [
          node("pages.layout", [node("pages.layout.tabs")]),
          node("pages.form", [
            node("pages.form.simple", [
              node("pages.form.simple.form"),
              node("pages.form.simple.extra"),
            ]),
            node("pages.form.advanced"),
          ]),
        ]),
        node("examples", [node("examples.overview")]),
      ];
      // As `GetMenuOrder` numbers the sidebar: depth first, menu order.
      const menuOrder = new Map(
        [
          "pages",
          "pages.form",
          "pages.form.advanced",
          "pages.form.simple",
          "pages.layout",
          "pages.layout.tabs",
          "settings",
          "settings.user",
          "examples",
          "examples.overview",
        ].map((id, position) => [id, position]),
      );

      expect(ids(orderRoleEditorTree(tree, menuOrder))).to.deep.equal([
        [
          "pages",
          [
            [
              "pages.form",
              [
                "pages.form.advanced",
                [
                  "pages.form.simple",
                  // Not menu entries: declaration order.
                  ["pages.form.simple.form", "pages.form.simple.extra"],
                ],
              ],
            ],
            ["pages.layout", ["pages.layout.tabs"]],
          ],
        ],
        ["examples", ["examples.overview"]],
        ["settings", ["settings.user"]],
      ]);
    });

    it("puts components before the sub-pages of a page", () => {
      const tree = [
        node("pages.nested", [
          node("pages.nested.child"),
          node("pages.nested.table"),
        ]),
      ];
      const menuOrder = new Map([
        ["pages.nested", 0],
        ["pages.nested.child", 1],
      ]);
      expect(ids(orderRoleEditorTree(tree, menuOrder))).to.deep.equal([
        ["pages.nested", ["pages.nested.table", "pages.nested.child"]],
      ]);
    });
  });

  it("counts only the granted permissions the tree still knows", () => {
    const known = new Set(["a", "a.b"]);
    expect(countKnownPermissions(["a", "a.b", "gone", "a"], known)).to.equal(2);
  });

  describe("summarizeRoles", () => {
    const members = [
      member("u1", ["r-admin"], true),
      member("u2", ["r-admin", "r-support"]),
      member("u3", ["r-admin"]),
      member("u4", ["r-admin"]),
    ];
    const userNames = new Map([
      ["u1", "Ada"],
      ["u2", "Bob"],
    ]);

    it("sorts by name and counts members, pending invites and permissions", () => {
      const [admin, support] = summarizeRoles({
        roles: [
          role("r-support", "Support", ["a"]),
          role("r-admin", "Admin", ["a", "a.b", "legacy"]),
        ],
        members,
        invites: [
          invite(["r-support"], TOMORROW),
          invite(["r-support"], YESTERDAY),
        ],
        userNames,
        knownPermissionIds: new Set(["a", "a.b"]),
        now: NOW,
      });

      expect(admin.name).to.equal("Admin");
      expect(admin.memberCount).to.equal(4);
      expect(admin.members).to.have.length(ROLE_MEMBER_PREVIEW_LIMIT);
      expect(admin.members[0]).to.deep.equal({ userId: "u1", name: "Ada" });
      expect(admin.permissionCount).to.equal(2);
      expect(admin.permissions).to.include("legacy");
      expect(support.memberCount).to.equal(1);
      expect(support.inviteCount).to.equal(1);
      expect(support.description).to.equal("");
    });

    it("summarizes the tenant owners", () => {
      expect(summarizeOwners(members, userNames)).to.deep.equal({
        memberCount: 1,
        members: [{ userId: "u1", name: "Ada" }],
      });
    });
  });

  describe("replaceRoleReference", () => {
    it("leaves a list without the deleted role unchanged", () => {
      expect(replaceRoleReference(["a"], "b")).to.equal(undefined);
    });

    it("drops the deleted role", () => {
      expect(replaceRoleReference(["a", "b"], "b")).to.deep.equal(["a"]);
    });

    it("moves the holder to the replacement role once", () => {
      expect(replaceRoleReference(["b"], "b", "c")).to.deep.equal(["c"]);
      expect(replaceRoleReference(["c", "b"], "b", "c")).to.deep.equal(["c"]);
    });
  });

  it("counts the members and pending invitations holding a role", () => {
    const holders = countRoleHolders(
      "r",
      [member("u1", ["r"]), member("u2", ["x"])],
      [invite(["r"], TOMORROW), invite(["r"], YESTERDAY)],
      NOW,
    );
    expect(holders).to.equal(2);
  });
});
