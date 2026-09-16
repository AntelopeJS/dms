import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import {
  GetPermission,
  GetPermissions,
  internal as permissionsImplInternal,
} from "../../../../implementations/dms/permissions";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";

const PARENT = "teardown.parent";
const CHILD = `${PARENT}.child`;
const GRANDCHILD = `${CHILD}.action`;

function register(id: string, defaultGranted = false): void {
  permissionsImplInternal.RegisterPermission.register(id, {
    id,
    title: id,
    defaultGranted,
  });
}

function treeNode(path: string[]): unknown {
  let level = GetPermissions();
  for (const part of path.slice(0, -1)) {
    const node = level[part];
    if (!node) return undefined;
    level = node.children;
  }
  return level[path[path.length - 1]];
}

describe("[unit] implementations/dms/permissions — teardown", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  afterEach(() => {
    for (const id of [GRANDCHILD, CHILD, PARENT]) {
      permissionsImplInternal.RegisterPermission.unregister(id);
    }
  });

  it("removes a permission from both the flat lookup and the tree", () => {
    register(PARENT);

    permissionsImplInternal.RegisterPermission.unregister(PARENT);

    expect(GetPermission(PARENT)).to.equal(undefined);
    expect(treeNode(["teardown", "parent"])).to.equal(undefined);
  });

  // Unregistering a parent used to delete the whole subtree: pages still
  // registered under a category lost their permission with it.
  it("leaves a still-registered descendant alone", () => {
    register(PARENT);
    register(CHILD);

    permissionsImplInternal.RegisterPermission.unregister(PARENT);

    expect(GetPermission(CHILD)?.id).to.equal(CHILD);
    expect(treeNode(["teardown", "parent", "child"])).to.not.equal(undefined);
  });

  it("drops the parent's own entry while keeping it as a container", () => {
    register(PARENT);
    register(CHILD);

    permissionsImplInternal.RegisterPermission.unregister(PARENT);

    expect(GetPermission(PARENT)).to.equal(undefined);
    expect(
      (treeNode(["teardown", "parent"]) as { data?: unknown } | undefined)
        ?.data,
    ).to.equal(undefined);
  });

  it("prunes the branch once its last descendant goes", () => {
    register(PARENT);
    register(CHILD);
    permissionsImplInternal.RegisterPermission.unregister(PARENT);

    permissionsImplInternal.RegisterPermission.unregister(CHILD);

    expect(treeNode(["teardown"])).to.equal(undefined);
  });

  // A stale `defaultGranted` permission keeps granting access, and the roles
  // UI hides those by design — invisible and still in force.
  it("stops a defaultGranted permission from granting once unregistered", async () => {
    register(GRANDCHILD, true);
    expect(
      await permissionsInterface.HasPermission(new Set(), GRANDCHILD),
    ).to.equal(true);

    permissionsImplInternal.RegisterPermission.unregister(GRANDCHILD);

    expect(
      await permissionsInterface.HasPermission(new Set(), GRANDCHILD),
    ).to.equal(false);
  });
});
