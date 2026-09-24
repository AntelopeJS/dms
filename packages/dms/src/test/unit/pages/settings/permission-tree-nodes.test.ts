import { expect } from "chai";
import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import { mapPermissionTreeToPermissionNodes } from "../../../../pages/settings/users/permission-tree-nodes";

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

    expect(mapPermissionTreeToPermissionNodes(tree)).to.deep.equal([
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

    expect(
      mapPermissionTreeToPermissionNodes(tree).map((node) => node.id),
    ).to.deep.equal(["media.upload", "media.folders.manage"]);
  });

  it("lifts a permission registered three levels below any registered id", () => {
    const tree = {
      a: unregistered({ b: unregistered({ c: registered("a.b.c") }) }),
    };

    expect(mapPermissionTreeToPermissionNodes(tree)).to.deep.equal([
      { id: "a.b.c", label: "a.b.c", icon: undefined, children: undefined },
    ]);
  });

  it("lifts an orphan permission into its closest registered ancestor", () => {
    const tree = {
      a: registered("a", {
        b: unregistered({ c: registered("a.b.c") }),
      }),
    };

    const [root] = mapPermissionTreeToPermissionNodes(tree);

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

    expect(mapPermissionTreeToPermissionNodes(tree)).to.deep.equal([]);
  });
});
