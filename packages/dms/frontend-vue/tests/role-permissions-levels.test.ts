import { describe, expect, it } from "vitest";
import {
  buildPermissionAreas,
  buildPermissionIndex,
  buildPermissionLevels,
  collapseOneLevel,
  expandOneLevel,
  nextCollapseDepth,
  nextExpandDepth,
  openDepth,
  grantPermission,
  selectedWarningLabels,
  selectedWarningsBelow,
} from "../layers/dms-layout/app/entries/components/pages/settings/roles/role-permissions";
import type { RolePermissionNode } from "../layers/dms-layout/app/entries/components/pages/settings/roles/role-types";
import { TREE, identity } from "./helpers/role-permissions-fixtures";
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
        "settings.user.roles",
      ],
      [
        "pages.sales",
        "pages.sales.orders",
        "settings.user",
        "settings.user.profile",
        "settings.user.roles",
        "settings.user.roles.table",
      ],
    ]);
    expect(openDepth(levels, expanded)).toBe(3);

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
    let expanded = open("settings.user", "settings.user.roles");
    expect(openDepth(levels, expanded)).toBe(0);
    expect(nextExpandDepth(levels, expanded)).toBe(1);
    expanded = expandOneLevel(levels, expanded);
    expect(sorted(expanded)).toEqual([
      "pages.sales",
      "settings.user",
      "settings.user.roles",
    ]);
    expect(nextExpandDepth(levels, expanded)).toBe(2);

    expanded = open(
      "pages.sales",
      "settings.user",
      "settings.user.roles",
      "settings.user.roles.table",
    );
    expect(nextExpandDepth(levels, expanded)).toBe(2);
    expect(openDepth(levels, expanded)).toBe(1);
  });

  it("collapses the deepest depth shown open, not a hidden open row", () => {
    const expanded = open(
      "pages.sales",
      "settings.user.roles",
      "settings.user.roles.table",
    );
    expect(nextCollapseDepth(levels, expanded)).toBe(1);

    expect(sorted(collapseOneLevel(levels, expanded))).toEqual([]);

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

describe("owner-level warnings", () => {
  const WARNING = "$warning.members";
  const WARNED: RolePermissionNode[] = [
    {
      id: "settings",
      label: "Settings",
      children: [
        {
          id: "settings.members",
          label: "Members",
          children: [
            {
              id: "settings.members.table",
              label: "Members table",
              children: [
                { id: "settings.members.table.list", label: "List" },
                {
                  id: "settings.members.table.edit",
                  label: "Edit",
                  warning: WARNING,
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  const index = buildPermissionIndex(WARNED);
  const areas = buildPermissionAreas(WARNED, (label) => label);

  it("tells a closed row the warnings of what it holds selected", () => {
    const granted = grantPermission(
      index,
      new Set(),
      "settings.members",
      () => true,
    ).selection;

    expect(selectedWarningsBelow(index, "settings.members", granted)).toEqual([
      WARNING,
    ]);
    expect(
      selectedWarningsBelow(index, "settings.members.table.edit", granted),
    ).toEqual([]);
    expect(
      selectedWarningsBelow(
        index,
        "settings.members",
        new Set(["settings.members", "settings.members.table.list"]),
      ),
    ).toEqual([]);
  });

  it("names the selected warned permissions under their area", () => {
    const granted = grantPermission(
      index,
      new Set(),
      "settings",
      () => true,
    ).selection;

    expect(
      selectedWarningLabels(index, areas, granted, (label) => label),
    ).toEqual(["Members › Edit"]);
    expect(
      selectedWarningLabels(index, areas, new Set(), (label) => label),
    ).toEqual([]);
  });
});
