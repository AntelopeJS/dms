import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import type { RoleModel } from "@antelopejs/interface-dms/db";
import { withBackfilledDependencies } from "@antelopejs/interface-dms/internal/backfilled-grants";
import { withRequiredPermissions } from "@antelopejs/interface-dms/internal/permission-requirements";
import {
  type ComponentNodeMap,
  filterComponents,
} from "@antelopejs/interface-dms/page/layout-filter";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  GetPermission,
  GetUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { classifyPreviewBlocks } from "../../../../pages/settings/users/role-preview";

// The actions a table's rows lead to depend on its `list`, and the table
// itself is withheld without it; roles stored before keep their rights.

const CATEGORY = "tld-sales";
const PAGE = `${CATEGORY}.invoices`;
const TABLE = `${PAGE}.table`;
const LIST = `${TABLE}.list`;
const SELECT = `${TABLE}.select`;
const VIEW = `${TABLE}.view`;
const EDIT = `${TABLE}.edit`;
const DELETE = `${TABLE}.delete`;
const VIEW_ARCHIVED = `${TABLE}.viewArchived`;
const RESTORE = `${TABLE}.restore`;
const PAGE_EDIT = `${TABLE}.page-edit`;
const NOTES = `${PAGE}.notes`;
const CHAIN = [CATEGORY, PAGE, TABLE];

const REGISTERED = [
  { id: CATEGORY, title: "Sales" },
  { id: PAGE, title: "Invoices" },
  { id: TABLE, title: "Table", requires: [LIST] },
  { id: LIST, title: "List" },
  { id: SELECT, title: "Select", defaultGranted: true },
  { id: VIEW, title: "View", dependencies: [LIST] },
  { id: EDIT, title: "Edit", dependencies: [VIEW, LIST] },
  { id: DELETE, title: "Delete", dependencies: [LIST] },
  { id: VIEW_ARCHIVED, title: "View archived", dependencies: [LIST] },
  { id: RESTORE, title: "Restore", dependencies: [VIEW_ARCHIVED] },
  // An edit form opening as its own page: reached by URL, not from the rows.
  { id: PAGE_EDIT, title: "Edit (page)" },
  { id: NOTES, title: "Notes" },
];

const CONTEXT = { tenantId: "tenant", user: undefined };
const table = new ComponentBuilder("tld-table").options({});
const notes = new ComponentBuilder("tld-notes").options({});
const componentMap: ComponentNodeMap = new Map([
  [TABLE, { component: table, permissionId: TABLE, depth: 0, access: "own" }],
  [NOTES, { component: notes, permissionId: NOTES, depth: 0, access: "own" }],
]);

/** The blocks of the page a permission set is served. */
async function servedBlocks(permissions: string[]): Promise<string[]> {
  const served = await filterComponents(
    { table: await table.serialize(), notes: await notes.serialize() },
    PAGE,
    new Set(permissions),
    componentMap,
    CONTEXT,
  );
  return Object.keys(served);
}

/** A role model serving the given stored roles. */
function rolesHolding(...roles: string[][]): RoleModel {
  const stored = roles.map((permissions, index) => ({
    _id: `role-${index}`,
    permissions,
  }));
  return {
    getBy: async (_field: string, ...ids: string[]) =>
      stored.filter((role) => ids.includes(role._id)),
  } as unknown as RoleModel;
}

describe("[unit] interfaces/dms/permissions — table actions need the list", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    for (const permission of REGISTERED) {
      permissionsInterface.RegisterPermission(permission.id, permission);
    }
  });

  after(() => {
    for (const { id } of REGISTERED) {
      permissionsInterface.UnregisterPermission(id);
    }
  });

  describe("HasPermission", () => {
    it("refuses an edit held with its view but without the list", async () => {
      const permissions = new Set([...CHAIN, VIEW, EDIT]);
      expect(await HasPermission(permissions, EDIT)).to.equal(false);
      expect(
        await HasPermission(new Set([...permissions, LIST]), EDIT),
      ).to.equal(true);
    });

    it("still grants select without the list", async () => {
      expect(await HasPermission(new Set(CHAIN), SELECT)).to.equal(true);
    });

    it("withholds a table granted without its list", async () => {
      expect(await HasPermission(new Set(CHAIN), TABLE)).to.equal(false);
      expect(await HasPermission(new Set([...CHAIN, LIST]), TABLE)).to.equal(
        true,
      );
    });

    it("grants a page-mode edit without the list, whose table stays withheld", async () => {
      const permissions = new Set([...CHAIN, PAGE_EDIT]);
      expect(await HasPermission(permissions, PAGE_EDIT)).to.equal(true);
      expect(await HasPermission(permissions, TABLE)).to.equal(false);
    });

    it("refuses a restore without the archived view, and that without the list", async () => {
      const withArchive = new Set([...CHAIN, LIST, VIEW_ARCHIVED, RESTORE]);
      expect(await HasPermission(withArchive, RESTORE)).to.equal(true);
      const withoutList = new Set([...CHAIN, VIEW_ARCHIVED, RESTORE]);
      expect(await HasPermission(withoutList, RESTORE)).to.equal(false);
    });
  });

  describe("serving the page", () => {
    it("leaves out a table granted without its list, and keeps the rest", async () => {
      expect(await servedBlocks([...CHAIN, NOTES, EDIT, VIEW])).to.deep.equal([
        "notes",
      ]);
      expect(await servedBlocks([...CHAIN, NOTES, LIST])).to.deep.equal([
        "table",
        "notes",
      ]);
    });

    it("previews that table as hidden", async () => {
      const preview = new Set([...CHAIN, NOTES, VIEW]);
      const granted = async (id: string) =>
        (await HasPermission(preview, id)) ? [id] : [];
      const ids = [TABLE, LIST, VIEW, NOTES];
      const blocks = classifyPreviewBlocks(
        [
          {
            path: "table",
            permissionId: TABLE,
            actionIds: [LIST, VIEW],
            children: [],
          },
          { path: "notes", permissionId: NOTES, actionIds: [], children: [] },
        ],
        {
          real: new Set(ids),
          preview: new Set((await Promise.all(ids.map(granted))).flat()),
        },
        false,
      );
      expect(blocks).to.deep.equal({ table: { state: "hidden" } });
    });
  });

  describe("saving a role", () => {
    it("adds the list to an edit", async () => {
      expect(await withRequiredPermissions([EDIT])).to.include.members([
        LIST,
        VIEW,
        ...CHAIN,
      ]);
    });

    it("adds the archived view and the list to a restore", async () => {
      expect(await withRequiredPermissions([RESTORE])).to.include.members([
        VIEW_ARCHIVED,
        LIST,
      ]);
    });

    it("does not grant the list a table requires", async () => {
      expect(await withRequiredPermissions([TABLE])).to.not.include(LIST);
    });
  });

  describe("roles stored before the dependencies", () => {
    const getPermission = (id: string) => GetPermission(id);

    it("completes an edit with the list it now needs", async () => {
      const completed = await withBackfilledDependencies(
        [...CHAIN, VIEW, EDIT, DELETE],
        getPermission,
      );
      expect(completed).to.have.members([...CHAIN, VIEW, EDIT, DELETE, LIST]);
    });

    it("completes a restore with the archived view and its list", async () => {
      const completed = await withBackfilledDependencies(
        [...CHAIN, RESTORE],
        getPermission,
      );
      expect(completed).to.include.members([VIEW_ARCHIVED, LIST]);
    });

    it("leaves a completed role, and a table held alone, unchanged", async () => {
      const completed = [...CHAIN, LIST, VIEW, EDIT];
      expect(
        await withBackfilledDependencies(completed, getPermission),
      ).to.equal(completed);
      expect(
        await withBackfilledDependencies([...CHAIN], getPermission),
      ).to.have.members(CHAIN);
    });

    it("keeps the rights of a stored role in the member's permission set", async () => {
      const permissions = await GetUserPermissions(
        {},
        ["role-0"],
        rolesHolding([...CHAIN, VIEW, EDIT]),
      );
      expect(await HasPermission(permissions, EDIT)).to.equal(true);
      expect(await HasPermission(permissions, TABLE)).to.equal(true);
    });
  });
});
