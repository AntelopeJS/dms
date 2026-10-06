import { describe, expect, it } from "vitest";
import {
  buildPermissionAreas,
  buildPermissionIndex,
  buildPermissionLevels,
  checkboxState,
  collapseOneLevel,
  countSelected,
  diffPermissions,
  expandOneLevel,
  grantPermission,
  highlightSegments,
  idPrefixes,
  nextCollapseDepth,
  nextExpandDepth,
  openDepth,
  type PermissionIndex,
  revokePermission,
  searchPermissions,
  selectionState,
} from "../layers/dms-layout/app/build/components/pages/settings/roles/role-permissions";
import type { RolePermissionNode } from "../layers/dms-layout/app/build/components/pages/settings/roles/role-types";

const TREE: RolePermissionNode[] = [
  {
    id: "pages",
    label: "Pages",
    children: [
      {
        id: "pages.sales",
        label: "Sales",
        children: [
          { id: "pages.sales.export", label: "Export orders" },
          {
            id: "pages.sales.orders",
            label: "Orders",
            children: [
              { id: "pages.sales.orders.read", label: "View orders" },
              {
                id: "pages.sales.orders.refund",
                label: "Refund orders",
                dependencies: ["pages.sales.orders.read"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    children: [
      {
        id: "settings.user",
        label: "User settings",
        children: [
          {
            id: "settings.workspace.roles",
            label: "Roles",
            children: [
              {
                id: "settings.workspace.roles.table",
                label: "Roles list",
                children: [
                  { id: "settings.workspace.roles.table.list", label: "List" },
                  { id: "settings.workspace.roles.table.edit", label: "Edit" },
                ],
              },
            ],
          },
          {
            id: "settings.user.profile",
            label: "Profile",
            children: [
              {
                id: "settings.user.profile.profileComponent",
                label: "Personal information",
              },
            ],
          },
        ],
      },
    ],
  },
  // Registered under an unregistered `media`: lifted to the top of the tree.
  {
    id: "media.upload",
    label: "Upload",
    children: [{ id: "media.upload.form", label: "Form" }],
  },
  { id: "examples", label: "Examples" },
];

const identity = (label: string) => label;
const anyone = () => true;

/**
 * The original roles form (`dms-ui` `form/components/PermissionsTree.vue`,
 * the `PermissionsType` field of the roles table), kept here verbatim in
 * behaviour as the reference the editor must store the same ids as.
 */
const original = {
  findNodeById(
    id: string,
    nodes: RolePermissionNode[],
  ): RolePermissionNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = original.findNodeById(id, node.children);
        if (found) return found;
      }
    }
    return null;
  },
  getAllChildIds(node: RolePermissionNode): string[] {
    return [node.id, ...(node.children ?? []).flatMap(original.getAllChildIds)];
  },
  getAncestorPaths(path: string): string[] {
    const parts = path.split(".");
    const paths: string[] = [];
    for (let i = parts.length; i > 0; i--) {
      paths.push(parts.slice(0, i).join("."));
    }
    return paths;
  },
  shouldRemoveParent(parentId: string, remainingIds: string[]): boolean {
    const parentNode = original.findNodeById(parentId, TREE);
    if (!parentNode || !parentNode.children) return false;
    const descendantIds = original
      .getAllChildIds(parentNode)
      .filter((id) => id !== parentNode.id);
    return !descendantIds.some((id) => remainingIds.includes(id));
  },
  /** `handleCheckChange` of the original form. */
  check(selected: string[], node: RolePermissionNode, checked: boolean) {
    const descendantIds = original.getAllChildIds(node);
    const ancestorPaths = original.getAncestorPaths(node.id);
    if (checked) {
      return [...new Set([...selected, ...descendantIds, ...ancestorPaths])];
    }
    let remainingIds = selected.filter((id) => !descendantIds.includes(id));
    const ancestorsToRemove = ancestorPaths.filter((ancestorId) =>
      original.shouldRemoveParent(ancestorId, remainingIds),
    );
    remainingIds = remainingIds.filter((id) => !ancestorsToRemove.includes(id));
    return remainingIds;
  },
  /** Checkbox value of `PermissionsTreeNode.vue`. */
  checkbox(selected: string[], node: RolePermissionNode) {
    if (node.children && node.children.length > 0) {
      const descendantIds = original
        .getAllChildIds(node)
        .filter((id) => id !== node.id);
      const checkedCount = descendantIds.filter((id) =>
        selected.includes(id),
      ).length;
      if (checkedCount > 0 && checkedCount < descendantIds.length) {
        return "indeterminate" as const;
      }
    }
    return selected.includes(node.id);
  },
};

/** A click on a checkbox: a mixed or empty box checks, a checked one clears. */
function clickedValue(state: boolean | "indeterminate"): boolean {
  return state === "indeterminate" ? true : !state;
}

/** The editor's toggle (`useRoleEditor.toggle`) with everything grantable. */
function editorClick(
  index: PermissionIndex,
  selection: Set<string>,
  id: string,
): Set<string> {
  const checked = clickedValue(checkboxState(index, id, selection));
  return checked
    ? grantPermission(index, selection, id, anyone).selection
    : revokePermission(index, selection, id);
}

/** Deterministic pseudo-random sequence (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();

describe("role permissions", () => {
  const index = buildPermissionIndex(TREE);

  it("splits sections into areas, in the order the tree comes in", () => {
    const areas = buildPermissionAreas(TREE, identity);
    expect(
      areas.map((area) => [area.node.id, area.sectionNode?.id, area.section]),
    ).toEqual([
      ["pages.sales", "pages", "Pages"],
      ["settings.user", "settings", "Settings"],
      ["media.upload.form", "media.upload", "Upload"],
      ["examples", undefined, undefined],
    ]);
  });

  it("sorts the collapsible rows below the section headings by depth", () => {
    const { levels, parents } = buildPermissionLevels(
      buildPermissionAreas(TREE, identity),
    );
    // Sections (`pages`, `settings`, `media.upload`) are headings, and rows
    // without children (`media.upload.form`, `examples`) never open.
    expect(levels).toEqual([
      ["pages.sales", "settings.user"],
      ["pages.sales.orders", "settings.workspace.roles", "settings.user.profile"],
      ["settings.workspace.roles.table"],
    ]);
    expect(parents.get("settings.workspace.roles.table")).toBe(
      "settings.workspace.roles",
    );
    expect(parents.has("settings.user")).toBe(false);
  });

  it("lists the ids a permission sits under", () => {
    expect(idPrefixes("a.b.c")).toEqual(["a.b.c", "a.b", "a"]);
    expect(idPrefixes("pages")).toEqual(["pages"]);
  });

  it("grants a permission with the ids it sits under, not its dependencies", () => {
    const grant = grantPermission(
      index,
      new Set(),
      "pages.sales.orders.refund",
      anyone,
    );
    expect(sorted(grant.selection)).toEqual([
      "pages",
      "pages.sales",
      "pages.sales.orders",
      "pages.sales.orders.refund",
    ]);
    expect(sorted(grant.autoAdded)).toEqual([
      "pages",
      "pages.sales",
      "pages.sales.orders",
    ]);
  });

  it("grants the unregistered id a lifted permission sits under", () => {
    const grant = grantPermission(index, new Set(), "media.upload", anyone);
    expect(sorted(grant.selection)).toEqual([
      "media",
      "media.upload",
      "media.upload.form",
    ]);
    // Not a node: no "added automatically" hint to label.
    expect(grant.autoAdded).toEqual([]);
  });

  it("skips what the user may not grant", () => {
    const grant = grantPermission(
      index,
      new Set(),
      "pages.sales",
      (id) => id !== "pages.sales.export",
    );
    expect(grant.selection.has("pages.sales.export")).toBe(false);
    expect(grant.selection.has("pages.sales.orders.read")).toBe(true);
  });

  it("revokes ancestors left without descendants, never dependents", () => {
    const all = new Set(index.allIds);
    const afterRead = revokePermission(index, all, "pages.sales.orders.read");
    expect(afterRead.has("pages.sales.orders.refund")).toBe(true);
    expect(afterRead.has("pages.sales.orders")).toBe(true);
    const afterBoth = revokePermission(
      index,
      afterRead,
      "pages.sales.orders.refund",
    );
    expect(afterBoth.has("pages.sales.orders")).toBe(false);
    expect(afterBoth.has("pages.sales")).toBe(true);
  });

  it("judges every ancestor before dropping any, like the original form", () => {
    const next = revokePermission(
      index,
      new Set([
        "settings",
        "settings.user",
        "settings.workspace.roles",
        "settings.workspace.roles.table",
        "settings.workspace.roles.table.list",
      ]),
      "settings.workspace.roles.table.list",
    );
    // Only `settings.workspace.roles.table` is judged emptied: the ancestors above
    // it still saw it selected, so they stay.
    expect(sorted(next)).toEqual([
      "settings",
      "settings.user",
      "settings.workspace.roles",
    ]);
  });

  it("keeps ids the tree does not know", () => {
    const next = revokePermission(
      index,
      new Set(["legacy.permission", "pages.sales.export"]),
      "pages.sales.export",
    );
    expect([...next]).toEqual(["legacy.permission"]);
  });

  it("keeps the wildcard of a role through toggles", () => {
    const granted = grantPermission(index, new Set(["*"]), "examples", anyone);
    expect(granted.selection.has("*")).toBe(true);
    const revoked = revokePermission(index, granted.selection, "examples");
    expect(sorted(revoked)).toEqual(["*"]);
  });

  it("shows a checkbox state by the original form's rule", () => {
    const selection = new Set(["pages.sales.orders"]);
    // The page alone, without its components: checked, so a click revokes.
    expect(checkboxState(index, "pages.sales.orders", selection)).toBe(true);
    expect(
      checkboxState(
        index,
        "pages.sales.orders",
        new Set(["pages.sales.orders", "pages.sales.orders.read"]),
      ),
    ).toBe("indeterminate");
    // Every component but not the page: unchecked, so a click grants it.
    expect(
      checkboxState(
        index,
        "pages.sales.orders",
        new Set(["pages.sales.orders.read", "pages.sales.orders.refund"]),
      ),
    ).toBe(false);
  });

  it("stores exactly what the original form stored for the same clicks", () => {
    const random = seeded(20261001);
    const ids = index.allIds;
    for (let run = 0; run < 200; run++) {
      // Start from arbitrary saved roles, legacy and unknown ids included.
      const start = ids.filter(() => random() < 0.3);
      if (random() < 0.3) start.push("legacy.permission");
      let before = [...start];
      let after = new Set(start);
      for (let click = 0; click < 12; click++) {
        const id = ids[Math.floor(random() * ids.length)]!;
        const node = index.nodes.get(id)!;
        const originalState = original.checkbox(before, node);
        expect(checkboxState(index, id, after)).toBe(originalState);
        before = original.check(before, node, clickedValue(originalState));
        after = editorClick(index, after, id);
        expect(sorted(after)).toEqual(sorted(before));
      }
    }
  });

  it("counts a subtree and reports its checkbox state", () => {
    const count = countSelected(
      index,
      "pages.sales.orders",
      new Set(["pages.sales.orders", "pages.sales.orders.read"]),
    );
    expect(count).toEqual({ selected: 2, total: 3 });
    expect(selectionState(count)).toBe("indeterminate");
    expect(selectionState({ selected: 3, total: 3 })).toBe(true);
    expect(selectionState({ selected: 0, total: 3 })).toBe(false);
  });

  it("finds permissions under the path that locates them", () => {
    const hits = searchPermissions(
      index,
      buildPermissionAreas(TREE, identity),
      "refund",
      identity,
    );
    expect(hits).toEqual([
      {
        heading: "Pages › Sales › Orders",
        node: expect.objectContaining({ id: "pages.sales.orders.refund" }),
        areaId: "pages.sales",
      },
    ]);
  });

  it("finds the section and area headings too", () => {
    const hits = searchPermissions(
      index,
      buildPermissionAreas(TREE, identity),
      "settings",
      identity,
    );
    expect(hits.map((hit) => [hit.node.id, hit.heading, hit.areaId])).toEqual(
      expect.arrayContaining([
        ["settings", "", "settings"],
        ["settings.user", "Settings", "settings.user"],
        ["settings.workspace.roles", "Settings › User settings", "settings.user"],
      ]),
    );
  });

  it("marks every occurrence of the query", () => {
    expect(highlightSegments("Refund refunds", "refund")).toEqual([
      { text: "Refund", isMatch: true },
      { text: " ", isMatch: false },
      { text: "refund", isMatch: true },
      { text: "s", isMatch: false },
    ]);
  });

  it("diffs the selection against the saved permissions", () => {
    expect(diffPermissions(["a", "b"], new Set(["b", "c"]))).toEqual({
      added: ["c"],
      removed: ["a"],
    });
  });
});

describe("permission tree levels", () => {
  const levels = buildPermissionLevels(buildPermissionAreas(TREE, identity));
  const open = (...ids: string[]) => new Set(ids);
  const sorted = (ids: Set<string>) => [...ids].sort();

  it("opens a fresh tree one depth per step until everything is open", () => {
    let expanded = open();
    expect(nextCollapseDepth(levels, expanded)).toBeNull();
    const steps: string[][] = [];
    while (nextExpandDepth(levels, expanded) !== null) {
      expanded = expandOneLevel(levels, expanded);
      steps.push(sorted(expanded));
    }
    expect(steps).toEqual([
      ["pages.sales", "settings.user"],
      [
        "pages.sales",
        "pages.sales.orders",
        "settings.user",
        "settings.user.profile",
        "settings.workspace.roles",
      ],
      [
        "pages.sales",
        "pages.sales.orders",
        "settings.user",
        "settings.user.profile",
        "settings.workspace.roles",
        "settings.workspace.roles.table",
      ],
    ]);
    expect(openDepth(levels, expanded)).toBe(3);
    // Fully open: expanding again changes nothing.
    expect(expandOneLevel(levels, expanded)).toBe(expanded);
  });

  it("closes the deepest open depth per step until everything is closed", () => {
    let expanded = open(...levels.levels.flat());
    const depths: Array<number | null> = [];
    while (nextCollapseDepth(levels, expanded) !== null) {
      depths.push(nextCollapseDepth(levels, expanded));
      expanded = collapseOneLevel(levels, expanded);
      depths.push(openDepth(levels, expanded));
    }
    expect(depths).toEqual([3, 2, 2, 1, 1, 0]);
    expect(expanded.size).toBe(0);
    expect(nextExpandDepth(levels, expanded)).toBe(1);
    expect(collapseOneLevel(levels, expanded)).toBe(expanded);
  });

  it("fills the shallowest incomplete depth of a tree opened by hand", () => {
    // One area and one of its rows opened by hand, the other area closed.
    let expanded = open("settings.user", "settings.workspace.roles");
    expect(openDepth(levels, expanded)).toBe(0);
    expect(nextExpandDepth(levels, expanded)).toBe(1);
    expanded = expandOneLevel(levels, expanded);
    expect(sorted(expanded)).toEqual([
      "pages.sales",
      "settings.user",
      "settings.workspace.roles",
    ]);
    expect(nextExpandDepth(levels, expanded)).toBe(2);
    // Depth 3 is opened by hand, but depth 2 is still incomplete: it comes first.
    expanded = open(
      "pages.sales",
      "settings.user",
      "settings.workspace.roles",
      "settings.workspace.roles.table",
    );
    expect(nextExpandDepth(levels, expanded)).toBe(2);
    expect(openDepth(levels, expanded)).toBe(1);
  });

  it("collapses the deepest depth shown open, not a hidden open row", () => {
    // `settings.workspace.roles.table` is open but hidden under a closed area.
    const expanded = open(
      "pages.sales",
      "settings.workspace.roles",
      "settings.workspace.roles.table",
    );
    expect(nextCollapseDepth(levels, expanded)).toBe(1);
    // The hidden open rows below that depth close with it.
    expect(sorted(collapseOneLevel(levels, expanded))).toEqual([]);
    // A deeper row shown open is collapsed first.
    const deeper = open("pages.sales", "pages.sales.orders", "settings.user");
    expect(nextCollapseDepth(levels, deeper)).toBe(2);
    expect(sorted(collapseOneLevel(levels, deeper))).toEqual([
      "pages.sales",
      "settings.user",
    ]);
  });

  it("has no depth to open or close in a tree without collapsible rows", () => {
    const flat = buildPermissionLevels(
      buildPermissionAreas([{ id: "examples", label: "Examples" }], identity),
    );
    expect(flat.levels).toEqual([]);
    expect(nextExpandDepth(flat, open())).toBeNull();
    expect(nextCollapseDepth(flat, open())).toBeNull();
    expect(openDepth(flat, open())).toBe(0);
  });
});
