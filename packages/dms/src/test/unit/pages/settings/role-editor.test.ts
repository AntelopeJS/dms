import { expect } from "chai";
import type { Role } from "@antelopejs/interface-dms/db";
import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import {
  collectPermissionIds,
  countKnownPermissions,
  mapRoleEditorTree,
  orderRoleEditorTree,
  replaceRoleReference,
  type RoleEditorPermissionNode,
  ROLE_MEMBER_PREVIEW_LIMIT,
  summarizeOwners,
  summarizeRoles,
  mapPermissionTree,
} from "../../../../pages/permissions";

const NOW = new Date("2026-06-01T00:00:00Z");

function role(id: string, name: string, permissions: string[]): Role {
  return { _id: id, name, permissions, createdAt: NOW, updatedAt: NOW };
}

function registerMapRoleEditorTreeCases(): void {
  describe("mapRoleEditorTree", () => {
    it("keeps descriptions and dependencies and lifts unregistered ids", () => {
      const tree = {
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
      } satisfies Record<string, PermissionTree>;

      const [orders] = mapRoleEditorTree(tree);

      expect(orders.id).to.equal("sales.orders");
      expect(orders.description).to.equal("See orders");
      expect(orders.children?.[0].dependencies).to.deep.equal(["sales.orders"]);
      expect(collectPermissionIds([orders])).to.deep.equal([
        "sales.orders",
        "sales.orders.edit",
      ]);
    });

    it("offers the nodes the permission tree mapping lifts, in the same shape", () => {
      const permission = (id: string, extra = {}) => ({
        data: { id, title: id, ...extra },
        children: {},
      });
      const tree = {
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
      } satisfies Record<string, PermissionTree>;
      type PermissionNode = { id: string; children?: PermissionNode[] };
      const hierarchy = (nodes: PermissionNode[]): PermissionNode[] =>
        nodes.map((node) => ({
          id: node.id,
          children: node.children && hierarchy(node.children),
        }));

      expect(hierarchy(mapRoleEditorTree(tree))).to.deep.equal(
        hierarchy(
          mapPermissionTree<PermissionNode>(tree, (permission, children) => ({
            id: permission.id,
            children,
          })),
        ),
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
}

function registerOrderRoleEditorTreeCases(): void {
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

    it("keeps the settings last once the root every member holds is lifted out", () => {
      const tree = [
        node("settings.workspace", [node("settings.workspace.members")]),
        node("pages", [node("pages.home")]),
      ];
      const menuOrder = new Map(
        [
          "settings.workspace",
          "settings.workspace.members",
          "pages",
          "pages.home",
        ].map((id, position) => [id, position]),
      );

      expect(ids(orderRoleEditorTree(tree, menuOrder))).to.deep.equal([
        ["pages", ["pages.home"]],
        ["settings.workspace", ["settings.workspace.members"]],
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
}

function registerRoleSummaryCases(): void {
  describe("summarizeRoles", () => {
    const userNames = new Map([
      ["u1", "Ada"],
      ["u2", "Bob"],
    ]);

    it("sorts by name and reports the counted holders, previews and known permissions", () => {
      const [admin, support, unheld] = summarizeRoles({
        roles: [
          role("r-support", "Support", ["a"]),
          role("r-admin", "Admin", ["a", "a.b", "legacy"]),
          role("r-unheld", "Unheld", []),
        ],
        holders: new Map([
          [
            "r-admin",
            {
              memberCount: 4,
              previewUserIds: ["u1", "u2", "u3", "u4"],
              inviteCount: 0,
            },
          ],
          [
            "r-support",
            { memberCount: 1, previewUserIds: ["u2"], inviteCount: 1 },
          ],
        ]),
        userNames,
        knownPermissionIds: new Set(["a", "a.b"]),
      });

      expect(admin.name).to.equal("Admin");
      expect(admin.memberCount).to.equal(4);
      expect(admin.members).to.deep.equal([
        { userId: "u1", name: "Ada" },
        { userId: "u2", name: "Bob" },
        { userId: "u3", name: "" },
      ]);
      expect(admin.members).to.have.length(ROLE_MEMBER_PREVIEW_LIMIT);
      expect(admin.permissionCount).to.equal(2);
      expect(admin.permissions).to.include("legacy");
      expect(support.memberCount).to.equal(1);
      expect(support.inviteCount).to.equal(1);
      expect(support.description).to.equal("");
      expect(unheld).to.deep.include({
        memberCount: 0,
        members: [],
        inviteCount: 0,
      });
    });

    it("summarizes the tenant owners", () => {
      expect(summarizeOwners(["u1"], userNames)).to.deep.equal({
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
}

describe("[unit] pages/settings/users/role-editor", () => {
  registerMapRoleEditorTreeCases();
  registerOrderRoleEditorTreeCases();
  registerRoleSummaryCases();
});
