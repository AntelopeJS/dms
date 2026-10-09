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
// view as a dependency, and a saved role is completed with it.

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
  { id: AUDIT_VIEW, title: "View", dependencies: [`${AUDIT_TABLE}.list`] },
];

const TABLE_CAPABILITIES = {
  hasNewForm: true,
  hasEditForm: true,
  hasViewForm: true,
  hasDeleteEndpoint: true,
  archiveMode: false,
  isExportEnabled: false,
};

function tableActions(hasViewForm: boolean) {
  const builder = new ComponentBuilder("prq-table");
  registerTableViewActions(builder, { ...TABLE_CAPABILITIES, hasViewForm });
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

  it("keeps the wildcard and ids nothing registered", async () => {
    expect(
      await withRequiredPermissions(["*", "legacy.permission"]),
    ).to.have.members(["*", "legacy.permission", "legacy"]);
  });
});

describe("[unit] interfaces/dms-base/table-view — the edit action needs the view", () => {
  it("declares the view as a dependency of the edit", () => {
    const permissions = tableActions(true);
    expect(permissions.edit?.dependencies).to.deep.equal([VIEW]);
    expect(permissions.view?.dependencies).to.equal(undefined);
  });

  it("declares none when the table has no view form to read the row", () => {
    const permissions = tableActions(false);
    expect(permissions.edit?.dependencies).to.equal(undefined);
    expect(permissions).to.not.have.property("view");
  });
});
