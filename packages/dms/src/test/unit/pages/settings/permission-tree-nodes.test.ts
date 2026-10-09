import { expect } from "chai";
import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import {
  mapPermissionTree,
  permissionLabel,
} from "../../../../pages/settings/users/permission-tree-nodes";

interface LabelledNode {
  id: string;
  label: string;
  icon?: string;
  children?: LabelledNode[];
}

function mapToLabelledNodes(
  tree: Record<string, PermissionTree>,
  categoryIds?: ReadonlySet<string>,
): LabelledNode[] {
  return mapPermissionTree<LabelledNode>(
    tree,
    (permission, children) => ({
      id: permission.id,
      label: permissionLabel(permission),
      icon: permission.icon,
      children,
    }),
    categoryIds,
  );
}

function registered(
  id: string,
  children: Record<string, PermissionTree> = {},
  overrides: Partial<Permission> = {},
): PermissionTree {
  return { data: { id, title: id, ...overrides }, children };
}

function unregistered(
  children: Record<string, PermissionTree>,
): PermissionTree {
  return { children };
}

describe("[unit] pages/settings/users/permission-tree-nodes", () => {
  it("maps registered permissions to nested nodes", () => {
    const tree = {
      pages: registered("pages", {
        list: registered("pages.list", {}, { title: "List", icon: "i-list" }),
      }),
    };

    expect(mapToLabelledNodes(tree)).to.deep.equal([
      {
        id: "pages",
        label: "pages",
        icon: undefined,
        children: [
          {
            id: "pages.list",
            label: "List",
            icon: "i-list",
            children: undefined,
          },
        ],
      },
    ]);
  });

  it("lifts permissions whose parent id is not registered", () => {
    const tree = {
      media: unregistered({
        upload: registered("media.upload"),
        folders: unregistered({ manage: registered("media.folders.manage") }),
      }),
    };

    expect(mapToLabelledNodes(tree).map((node) => node.id)).to.deep.equal([
      "media.upload",
      "media.folders.manage",
    ]);
  });

  it("lifts a permission registered three levels below any registered id", () => {
    const tree = {
      a: unregistered({ b: unregistered({ c: registered("a.b.c") }) }),
    };

    expect(mapToLabelledNodes(tree)).to.deep.equal([
      { id: "a.b.c", label: "a.b.c", icon: undefined, children: undefined },
    ]);
  });

  it("lifts an orphan permission into its closest registered ancestor", () => {
    const tree = {
      a: registered("a", {
        b: unregistered({ c: registered("a.b.c") }),
      }),
    };

    const [root] = mapToLabelledNodes(tree);

    expect(root.id).to.equal("a");
    expect(root.children?.map((node) => node.id)).to.deep.equal(["a.b.c"]);
  });

  it("hides a default-granted permission together with its subtree", () => {
    const tree = {
      docs: registered(
        "docs",
        { edit: registered("docs.edit") },
        { defaultGranted: true },
      ),
    };

    expect(mapToLabelledNodes(tree)).to.deep.equal([]);
  });

  describe("under an entry every member holds", () => {
    // The settings root as registered: every member holds the root and the
    // account pages, the workspace pages still take a role.
    const settings = {
      settings: registered(
        "settings",
        {
          user: registered(
            "settings.user",
            {
              profile: registered(
                "settings.user.profile",
                { form: registered("settings.user.profile.form") },
                { defaultGranted: true },
              ),
            },
            { defaultGranted: true },
          ),
          workspace: registered("settings.workspace", {
            members: registered("settings.workspace.members", {
              table: registered("settings.workspace.members.table"),
            }),
          }),
        },
        { defaultGranted: true },
      ),
    };
    const entryIds = new Set([
      "settings",
      "settings.user",
      "settings.user.profile",
      "settings.workspace",
      "settings.workspace.members",
    ]);

    it("lifts the menu entries filed under it that still take a grant", () => {
      const nodes = mapPermissionTree<LabelledNode>(
        settings,
        (permission, children) => ({
          id: permission.id,
          label: permissionLabel(permission),
          children,
        }),
        new Set(["settings.user", "settings.workspace"]),
        entryIds,
      );

      expect(nodes).to.deep.equal([
        {
          id: "settings.workspace",
          label: "settings.workspace",
          children: [
            {
              id: "settings.workspace.members",
              label: "settings.workspace.members",
              children: [
                {
                  id: "settings.workspace.members.table",
                  label: "settings.workspace.members.table",
                  children: undefined,
                },
              ],
            },
          ],
        },
      ]);
    });

    it("still hides the components hanging off it", () => {
      const tree = {
        login: registered(
          "pages.login",
          { form: registered("pages.login.form") },
          { defaultGranted: true },
        ),
      };

      expect(
        mapPermissionTree<LabelledNode>(
          tree,
          (permission, children) => ({
            id: permission.id,
            label: permissionLabel(permission),
            children,
          }),
          new Set(),
          new Set(["pages.login"]),
        ),
      ).to.deep.equal([]);
    });
  });

  describe("categories", () => {
    // The built-in Pages root in a project filing its pages under a root of
    // its own: only the public sign-in pages are left below it.
    const publicOnly = {
      pages: registered("pages", {
        login: registered("pages.login", {}, { defaultGranted: true }),
      }),
      library: registered("library", { form: registered("library.form") }),
    };

    it("leaves out a category whose permissions below are all hidden", () => {
      expect(
        mapToLabelledNodes(publicOnly, new Set(["pages", "library"])).map(
          (node) => node.id,
        ),
      ).to.deep.equal(["library"]);
    });

    it("keeps a page whose components are all hidden", () => {
      expect(
        mapToLabelledNodes(publicOnly).map((node) => node.id),
      ).to.deep.equal(["pages", "library"]);
    });

    it("keeps a category with nothing registered below it", () => {
      const tree = { projects: registered("projects") };

      expect(mapToLabelledNodes(tree, new Set(["projects"]))).to.deep.equal([
        {
          id: "projects",
          label: "projects",
          icon: undefined,
          children: undefined,
        },
      ]);
    });
  });
});
