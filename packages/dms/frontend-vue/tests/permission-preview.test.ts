import { describe, expect, it } from "vitest";
import {
  applyPreviewLocks,
  buildPreviewUrl,
  childLayoutPath,
  isPreviewEntryLocked,
  isStalePreviewSession,
  listPreviewablePages,
  parsePreviewSession,
  PERMISSION_PREVIEW_TTL_MS,
  type PermissionPreviewResult,
  type PreviewLockableEntry,
  resolveActivePreviewBlock,
  resolvePreviewBlock,
} from "#dms-core/app/utils/permission-preview";

const SESSION = {
  id: "p1",
  roleId: "r1",
  roleName: "Support",
  permissions: ["sales.orders"],
  unsaved: true,
  returnTo: "/settings/roles",
  updatedAt: 1000,
};

describe("permission preview", () => {
  describe("parsePreviewSession", () => {
    it("reads a stored session", () => {
      expect(parsePreviewSession(JSON.stringify(SESSION))).toEqual(SESSION);
    });

    it("defaults the optional fields", () => {
      const { roleId: _roleId, unsaved: _unsaved, ...rest } = SESSION;
      expect(parsePreviewSession(JSON.stringify(rest))).toEqual({
        ...rest,
        roleId: null,
        unsaved: false,
      });
    });

    it("rejects anything else", () => {
      expect(parsePreviewSession(null)).toBeNull();
      expect(parsePreviewSession("{")).toBeNull();
      expect(parsePreviewSession("[]")).toBeNull();
      expect(
        parsePreviewSession(JSON.stringify({ ...SESSION, permissions: [1] })),
      ).toBeNull();
    });
  });

  it("drops sessions past their lifetime", () => {
    expect(isStalePreviewSession(SESSION, 1000)).toBe(false);
    expect(
      isStalePreviewSession(SESSION, 1000 + PERMISSION_PREVIEW_TTL_MS + 1),
    ).toBe(true);
  });

  it("builds layout paths like the server", () => {
    expect(childLayoutPath("grid", "kpis")).toBe("grid.kpis");
    expect(childLayoutPath(undefined, "kpis")).toBeUndefined();
  });

  it("resolves the block of a layout path", () => {
    const result: PermissionPreviewResult = {
      page: { fullId: "sales.orders", displayName: "Orders", hidden: false },
      blocks: {
        table: { state: "readonly", withheld: ["Edit"] },
        "grid.kpis": { state: "hidden" },
      },
      hiddenEntries: [],
      outOfScope: 0,
    };
    expect(resolvePreviewBlock(result, "grid.kpis")).toEqual({
      state: "hidden",
    });
    expect(resolvePreviewBlock(result, "grid")).toBeUndefined();
    expect(resolvePreviewBlock(result, undefined)).toBeUndefined();
    expect(resolvePreviewBlock(null, "table")).toBeUndefined();
  });

  it("adds the preview id to the first URL", () => {
    expect(buildPreviewUrl("/", "a b")).toBe("/?dms-preview=a%20b");
    expect(buildPreviewUrl("/x?y=1", "id")).toBe("/x?y=1&dms-preview=id");
  });

  it("offers the pages reachable without parameters", () => {
    const pages = {
      "/": { displayName: "Home" },
      "/orders": { displayName: "Orders", hasAccess: true },
      "/denied": { displayName: "Denied", hasAccess: false },
      "/auth/login": { displayName: "Login", publicAccess: true },
      "/hidden": { displayName: "Hidden", hidden: true },
      "/orders/:id": { displayName: "Order" },
      "/edit": {
        displayName: "Edit",
        validation: { requiredQueryParams: ["id"] },
      },
    };
    expect(listPreviewablePages(pages).map(({ slug }) => slug)).toEqual([
      "/",
      "/orders",
    ]);
  });
  describe("preview-only rendering", () => {
    const RESULT: PermissionPreviewResult = {
      page: { fullId: "sales.orders", displayName: "Orders", hidden: false },
      blocks: { table: { state: "hidden" } },
      hiddenEntries: ["sales.orders"],
      outOfScope: 0,
    };
    const HIDDEN = new Set(RESULT.hiddenEntries);

    it("veils a block only while a preview is active", () => {
      expect(resolveActivePreviewBlock(true, RESULT, "table")).toEqual({
        state: "hidden",
      });
      // A normal session, even holding a stale result, veils nothing.
      expect(resolveActivePreviewBlock(false, RESULT, "table")).toBeUndefined();
    });

    it("locks a menu entry only while a preview is active", () => {
      expect(isPreviewEntryLocked(true, HIDDEN, "sales.orders")).toBe(true);
      expect(isPreviewEntryLocked(false, HIDDEN, "sales.orders")).toBe(false);
      expect(isPreviewEntryLocked(true, HIDDEN, "sales.invoices")).toBe(false);
      expect(isPreviewEntryLocked(true, HIDDEN, undefined)).toBe(false);
    });
  });

  describe("applyPreviewLocks", () => {
    interface Entry extends PreviewLockableEntry {
      label: string;
      type?: "label";
      locked?: boolean;
      children?: Entry[];
    }
    const lock = (entry: Entry): Entry => ({ ...entry, locked: true });
    const lockedLabels = (entries: Entry[]): string[] =>
      entries.flatMap((entry) => [
        ...(entry.locked ? [entry.label] : []),
        ...lockedLabels(entry.children ?? []),
      ]);
    // A label group, a category with a nested category and a dynamic entry,
    // and the sidebar footer.
    const MENU: Entry[] = [
      { label: "Sales", type: "label", fullId: "pages.sales" },
      {
        label: "Orders",
        fullId: "pages.sales.orders",
        children: [
          {
            label: "Archive",
            fullId: "pages.sales.orders.archive",
            children: [
              { label: "Old", fullId: "pages.sales.orders.archive.old" },
            ],
          },
          { label: "Project", fullId: "pages.sales.orders.acme" },
        ],
      },
      { label: "Favorite without id" },
      { label: "Settings", fullId: "settings" },
      { label: "Modules", fullId: "modules" },
    ];

    it("locks labels, categories, nested and footer entries alike", () => {
      const hidden = new Set([
        "pages.sales",
        "pages.sales.orders.archive.old",
        "pages.sales.orders.acme",
        "modules",
      ]);
      const locked = applyPreviewLocks(
        MENU,
        (fullId) => isPreviewEntryLocked(true, hidden, fullId),
        lock,
      );
      expect(lockedLabels(locked)).toEqual([
        "Sales",
        "Old",
        "Project",
        "Modules",
      ]);
    });

    it("locks nothing outside a preview", () => {
      const hidden = new Set(MENU.map((entry) => entry.fullId ?? ""));
      const locked = applyPreviewLocks(
        MENU,
        (fullId) => isPreviewEntryLocked(false, hidden, fullId),
        lock,
      );
      expect(lockedLabels(locked)).toEqual([]);
    });
  });
});
