import { describe, expect, it } from "vitest";
import {
  buildPermissionAreas,
  buildPermissionIndex,
  buildPermissionLevels,
  checkboxState,
  countSelected,
  diffPermissions,
  grantPermission,
  highlightSegments,
  keepGrantedAutoAdded,
  revokePermission,
  searchPermissions,
  selectionState,
} from "../layers/dms-layout/app/entries/components/pages/settings/roles/role-permissions";
import type { RolePermissionNode } from "../layers/dms-layout/app/entries/components/pages/settings/roles/role-types";

import {
  TREE,
  identity,
  anyone,
  original,
  clickedValue,
  editorClick,
  seeded,
  sorted,
  withoutDependencies,
} from "./helpers/role-permissions-fixtures";

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

    expect(levels).toEqual([
      ["pages.sales", "settings.user"],
      ["pages.sales.orders", "settings.user.roles", "settings.user.profile"],
      ["settings.user.roles.table"],
    ]);
    expect(parents.get("settings.user.roles.table")).toBe(
      "settings.user.roles",
    );
    expect(parents.has("settings.user")).toBe(false);
  });

  it("grants a permission with the nodes above it and what it depends on", () => {
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
      "pages.sales.orders.read",
      "pages.sales.orders.refund",
    ]);
    expect(sorted(grant.autoAdded)).toEqual([
      "pages",
      "pages.sales",
      "pages.sales.orders",
      "pages.sales.orders.read",
    ]);
  });

  it("grants a table's view with its edit, where the form loads the row", () => {
    const grant = grantPermission(
      index,
      new Set(),
      "settings.user.roles.table.edit",
      anyone,
    );
    expect(grant.selection.has("settings.user.roles.table.view")).toBe(true);
    expect(grant.autoAdded).toContain("settings.user.roles.table.view");
    expect(grant.selection.has("settings.user.roles.table.list")).toBe(false);
  });

  it("leaves a dependency the user may not grant", () => {
    const grant = grantPermission(
      index,
      new Set(),
      "pages.sales.orders.refund",
      (id) => id !== "pages.sales.orders.read",
    );
    expect(grant.selection.has("pages.sales.orders.read")).toBe(false);
    expect(grant.selection.has("pages.sales.orders.refund")).toBe(true);
  });

  it("leaves the unregistered id a lifted permission sits under to the server", () => {
    const grant = grantPermission(index, new Set(), "media.upload", anyone);

    expect(sorted(grant.selection)).toEqual([
      "media.upload",
      "media.upload.form",
    ]);
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

  it("revokes what depends on a revoked permission, then the emptied ancestors", () => {
    const all = new Set(index.allIds);
    const afterRead = revokePermission(index, all, "pages.sales.orders.read");
    expect(afterRead.has("pages.sales.orders.refund")).toBe(false);
    expect(afterRead.has("pages.sales.orders")).toBe(false);
    expect(afterRead.has("pages.sales")).toBe(true);
    const afterRefund = revokePermission(
      index,
      all,
      "pages.sales.orders.refund",
    );
    expect(afterRefund.has("pages.sales.orders.read")).toBe(true);
    expect(afterRefund.has("pages.sales.orders")).toBe(true);
  });

  it("revokes a table's edit with its view", () => {
    const granted = grantPermission(
      index,
      new Set(),
      "settings.user.roles.table.edit",
      anyone,
    ).selection;
    const revoked = revokePermission(
      index,
      new Set([...granted, "settings.user.roles.table.list"]),
      "settings.user.roles.table.view",
    );
    expect(revoked.has("settings.user.roles.table.edit")).toBe(false);
    expect(revoked.has("settings.user.roles.table.list")).toBe(true);
  });

  it("judges every ancestor before dropping any, like the original form", () => {
    const next = revokePermission(
      index,
      new Set([
        "settings",
        "settings.user",
        "settings.user.roles",
        "settings.user.roles.table",
        "settings.user.roles.table.list",
      ]),
      "settings.user.roles.table.list",
    );

    expect(sorted(next)).toEqual([
      "settings",
      "settings.user",
      "settings.user.roles",
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

    expect(checkboxState(index, "pages.sales.orders", selection)).toBe(true);
    expect(
      checkboxState(
        index,
        "pages.sales.orders",
        new Set(["pages.sales.orders", "pages.sales.orders.read"]),
      ),
    ).toBe("indeterminate");

    expect(
      checkboxState(
        index,
        "pages.sales.orders",
        new Set(["pages.sales.orders.read", "pages.sales.orders.refund"]),
      ),
    ).toBe(false);
  });

  it("stores what the original form stored for the same clicks", () => {
    const plain = buildPermissionIndex(withoutDependencies(TREE));
    const random = seeded(20261001);
    const ids = plain.allIds;
    for (let run = 0; run < 200; run++) {
      const start = ids.filter(() => random() < 0.3);
      if (random() < 0.3) start.push("legacy.permission");
      let before = [...start];
      let after = new Set(start);
      for (let click = 0; click < 12; click++) {
        const id = ids[Math.floor(random() * ids.length)]!;
        const node = plain.nodes.get(id)!;
        const originalState = original.checkbox(before, node);
        expect(checkboxState(plain, id, after)).toBe(originalState);
        before = original.check(before, node, clickedValue(originalState));
        after = editorClick(plain, after, id);

        const known = before.filter(
          (kept) => plain.nodes.has(kept) || start.includes(kept),
        );
        expect(sorted(after)).toEqual(sorted(known));
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
        ["settings.user.roles", "Settings › User settings", "settings.user"],
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

const INVOICES = "pages.billing.invoices.table";
const LIST_TREE: RolePermissionNode[] = [
  {
    id: "pages.billing.invoices",
    label: "Invoices",
    children: [
      {
        id: INVOICES,
        label: "Table",
        children: [
          { id: `${INVOICES}.list`, label: "List" },
          { id: `${INVOICES}.select`, label: "Select" },
          {
            id: `${INVOICES}.view`,
            label: "View",
            dependencies: [`${INVOICES}.list`],
          },
          {
            id: `${INVOICES}.edit`,
            label: "Edit",
            dependencies: [`${INVOICES}.view`, `${INVOICES}.list`],
          },
          {
            id: `${INVOICES}.delete`,
            label: "Delete",
            dependencies: [`${INVOICES}.list`],
          },
          {
            id: `${INVOICES}.export`,
            label: "Export",
            dependencies: [`${INVOICES}.view`, `${INVOICES}.list`],
          },
        ],
      },
    ],
  },
];

describe("table actions depending on the list", () => {
  const listIndex = buildPermissionIndex(LIST_TREE, identity);

  it("ticks the list with an edit", () => {
    const grant = grantPermission(
      listIndex,
      new Set(),
      `${INVOICES}.edit`,
      anyone,
    );
    expect(grant.selection.has(`${INVOICES}.list`)).toBe(true);
    expect(grant.autoAdded).toContain(`${INVOICES}.list`);
  });

  it("unticks the actions reached from the rows with the list, and keeps the table", () => {
    const all = new Set(listIndex.allIds);
    const revoked = revokePermission(listIndex, all, `${INVOICES}.list`);
    for (const action of ["view", "edit", "delete", "export"]) {
      expect(revoked.has(`${INVOICES}.${action}`), action).toBe(false);
    }
    expect(revoked.has(`${INVOICES}.select`)).toBe(true);

    expect(revoked.has(INVOICES)).toBe(true);
  });

  it("clears the hints of what a revoked list took with it", () => {
    const edit = grantPermission(
      listIndex,
      new Set([INVOICES]),
      `${INVOICES}.edit`,
      anyone,
    );
    const hints = new Map([[`${INVOICES}.edit`, edit.autoAdded]]);
    const revoked = revokePermission(
      listIndex,
      edit.selection,
      `${INVOICES}.list`,
    );
    expect(keepGrantedAutoAdded(hints, revoked).size).toBe(0);
  });

  it("keeps a granted node's hint, naming only what is still granted", () => {
    const hints = new Map([
      ["a", ["b", "c"]],
      ["d", ["c"]],
      ["e", ["f"]],
    ]);
    const kept = keepGrantedAutoAdded(hints, new Set(["a", "b", "d", "f"]));
    expect([...kept]).toEqual([["a", ["b"]]]);
  });
});
