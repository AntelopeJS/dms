import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { withRequiredPermissions } from "@antelopejs/interface-dms/internal/permission-requirements";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { HasPermission } from "@antelopejs/interface-dms/permissions";

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
const CHAIN = [CATEGORY, PAGE, TABLE];

const REGISTERED = [
  { id: CATEGORY, title: "Sales" },
  { id: PAGE, title: "Invoices" },
  { id: TABLE, title: "Table" },
  { id: LIST, title: "List" },
  { id: SELECT, title: "Select", defaultGranted: true },
  { id: VIEW, title: "View", dependencies: [LIST] },
  { id: EDIT, title: "Edit", dependencies: [VIEW, LIST] },
  { id: DELETE, title: "Delete", dependencies: [LIST] },
  { id: VIEW_ARCHIVED, title: "View archived", dependencies: [LIST] },
  { id: RESTORE, title: "Restore", dependencies: [VIEW_ARCHIVED] },

  { id: PAGE_EDIT, title: "Edit (page)" },
];

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

    it("grants a page-mode edit without the list", async () => {
      expect(
        await HasPermission(new Set([...CHAIN, PAGE_EDIT]), PAGE_EDIT),
      ).to.equal(true);
    });

    it("refuses a restore without the archived view, and that without the list", async () => {
      const withArchive = new Set([...CHAIN, LIST, VIEW_ARCHIVED, RESTORE]);
      expect(await HasPermission(withArchive, RESTORE)).to.equal(true);
      const withoutList = new Set([...CHAIN, VIEW_ARCHIVED, RESTORE]);
      expect(await HasPermission(withoutList, RESTORE)).to.equal(false);
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
  });
});
