import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { registerTableViewActions } from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { withRequiredPermissions } from "@antelopejs/interface-dms/internal/permission-requirements";
import { permissionMap } from "@antelopejs/interface-dms/page/internal/registry";
// Wires the permission id an action reads off its component.
import "@antelopejs/interface-dms/page/registry";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";

// A table's edit form loads its row through the view route: a role holding
// the edit without the view opened the form empty. The edit declares the
// view as a dependency, and so does the export, which writes fields past the
// columns; a saved role is completed with them.

const PAGE = "prq-crm.contacts";
const TABLE = `${PAGE}.table`;
const EDIT = `${TABLE}.edit`;
const VIEW = `${TABLE}.view`;
const EXPORT = `${TABLE}.export`;
const AUDIT_PAGE = "prq-audit.log";
const AUDIT_TABLE = `${AUDIT_PAGE}.table`;
const AUDIT_VIEW = `${AUDIT_TABLE}.view`;

const REGISTERED = [
  { id: "prq-crm", title: "CRM" },
  { id: PAGE, title: "Contacts" },
  { id: TABLE, title: "Table" },
  { id: VIEW, title: "View" },
  { id: EDIT, title: "Edit", dependencies: [VIEW] },
  // A dependency elsewhere in the tree, itself depending on another.
  { id: EXPORT, title: "Export", dependencies: [AUDIT_VIEW] },
  { id: "prq-audit", title: "Audit" },
  { id: AUDIT_PAGE, title: "Log" },
  { id: AUDIT_TABLE, title: "Table" },
  { id: `${AUDIT_TABLE}.list`, title: "List" },
  { id: AUDIT_VIEW, title: "View", dependencies: [`${AUDIT_TABLE}.list`] },
];

const TABLE_CAPABILITIES = {
  hasNewForm: true,
  hasEditForm: true,
  hasViewForm: true,
  hasDeleteEndpoint: true,
  archiveMode: false,
  isExportEnabled: true,
  formsArePages: false,
  isListRequired: true,
};

type TableCapabilities = typeof TABLE_CAPABILITIES;

function tableBuilder(capabilities: Partial<TableCapabilities> = {}) {
  const builder = new ComponentBuilder("prq-table");
  registerTableViewActions(builder, { ...TABLE_CAPABILITIES, ...capabilities });
  return builder;
}

function tableActions(capabilities: Partial<TableCapabilities> = {}) {
  const builder = tableBuilder(capabilities);
  permissionMap.set(builder, TABLE);
  const permissions = Object.fromEntries(
    Object.values(builder.actions).map((action) => [
      action.id,
      action.toPermission(),
    ]),
  );
  permissionMap.delete(builder);
  return permissions;
}

describe("[unit] interfaces/dms/internal/permission-requirements", () => {
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

  it("completes a table's edit with its view and the ids it sits under", async () => {
    expect(await withRequiredPermissions([EDIT])).to.have.members([
      EDIT,
      VIEW,
      TABLE,
      PAGE,
      "prq-crm",
    ]);
  });

  it("follows a dependency to its own ancestors and dependencies", async () => {
    expect(await withRequiredPermissions([EXPORT])).to.include.members([
      AUDIT_VIEW,
      `${AUDIT_TABLE}.list`,
      AUDIT_TABLE,
      AUDIT_PAGE,
      "prq-audit",
    ]);
  });

  it("adds nothing to a view held alone, and lists each id once", async () => {
    const completed = await withRequiredPermissions([VIEW, VIEW, TABLE]);
    expect(completed).to.have.members([VIEW, TABLE, PAGE, "prq-crm"]);
    expect(completed).to.not.include(EDIT);
  });

  it("keeps the wildcard and ids nothing registered, without making up their parents", async () => {
    expect(
      await withRequiredPermissions(["*", "does.not.exist"]),
    ).to.have.members(["*", "does.not.exist"]);
  });

  it("adds the registered ancestors of an id nothing registers", async () => {
    expect(
      await withRequiredPermissions([`${TABLE}.retired-action`]),
    ).to.have.members([`${TABLE}.retired-action`, TABLE, PAGE, "prq-crm"]);
  });
});

const LIST = `${TABLE}.list`;
const VIEW_ARCHIVED = `${TABLE}.viewArchived`;

describe("[unit] interfaces/dms-base/table-view — the actions that read a row need the view", () => {
  it("declares the view as a dependency of the edit and the export", () => {
    const permissions = tableActions({ isListRequired: false });
    expect(permissions.edit?.dependencies).to.deep.equal([VIEW]);
    expect(permissions.export?.dependencies).to.deep.equal([VIEW]);
    expect(permissions.view?.dependencies).to.equal(undefined);
  });

  it("leaves the delete free of the view, since it reads nothing", () => {
    expect(tableActions().delete?.dependencies).to.deep.equal([LIST]);
  });

  it("declares none when the table has no view form to read the row", () => {
    const permissions = tableActions({
      hasViewForm: false,
      isListRequired: false,
    });
    expect(permissions.edit?.dependencies).to.equal(undefined);
    expect(permissions.export?.dependencies).to.equal(undefined);
    expect(permissions).to.not.have.property("view");
  });
});

describe("[unit] interfaces/dms-base/table-view — the actions reached from the rows need the list", () => {
  it("makes every action of a table whose forms open over it depend on its list", () => {
    const permissions = tableActions({ archiveMode: true });
    expect(permissions.add?.dependencies).to.deep.equal([LIST]);
    expect(permissions.edit?.dependencies).to.deep.equal([VIEW, LIST]);
    expect(permissions.view?.dependencies).to.deep.equal([LIST]);
    expect(permissions.delete?.dependencies).to.deep.equal([LIST]);
    expect(permissions.archive?.dependencies).to.deep.equal([LIST]);
    expect(permissions.viewArchived?.dependencies).to.deep.equal([LIST]);
    expect(permissions.export?.dependencies).to.deep.equal([VIEW, LIST]);
  });

  it("makes restore depend on the archived view it is pressed from", () => {
    expect(
      tableActions({ archiveMode: true }).restore?.dependencies,
    ).to.deep.equal([VIEW_ARCHIVED]);
  });

  it("leaves the forms opening as their own page reachable without the list", () => {
    const permissions = tableActions({ formsArePages: true });
    expect(permissions.add?.dependencies).to.equal(undefined);
    expect(permissions.edit?.dependencies).to.deep.equal([VIEW]);
    expect(permissions.view?.dependencies).to.equal(undefined);
    // Pressed from the rows whatever the forms do.
    expect(permissions.delete?.dependencies).to.deep.equal([LIST]);
    expect(permissions.export?.dependencies).to.deep.equal([VIEW, LIST]);
  });

  it("keeps select, which relation pickers of other pages use, independent", () => {
    const { select, list } = tableActions();
    expect(select?.dependencies).to.equal(undefined);
    expect(select?.defaultGranted).to.equal(true);
    expect(list?.dependencies).to.equal(undefined);
  });

  it("requires the list of the table itself, without granting it along", () => {
    expect(tableBuilder().metadata.requiredActions).to.deep.equal(["list"]);
  });

  it("drops every list dependency of a table opting out", () => {
    const permissions = tableActions({
      archiveMode: true,
      isListRequired: false,
    });
    for (const action of ["add", "view", "delete", "archive", "restore"]) {
      expect(permissions[action]?.dependencies, action).to.equal(undefined);
    }
    expect(permissions.viewArchived?.dependencies).to.equal(undefined);
    expect(
      tableBuilder({ isListRequired: false }).metadata.requiredActions,
    ).to.equal(undefined);
  });
});
