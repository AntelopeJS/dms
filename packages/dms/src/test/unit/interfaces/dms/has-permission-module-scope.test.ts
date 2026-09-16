import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { HasPermission } from "@antelopejs/interface-dms/permissions";

const MODULE_PAGE_PERMISSION = "hpms-mod.page";
const MODULE_ACTION_PERMISSION = "hpms-mod.page.table.add";
const REGULAR_PERMISSION = "hpms-regular.page";

describe("[unit] interfaces/dms/permissions — HasPermission module scoping", () => {
  before(async () => {
    // The mocha-loaded copy of the module has no runtime wiring; connect the
    // permission registry so the non-module path (GetPermission) resolves.
    ImplementInterface(permissionsInterface, permissionsImpl);
    permissionsInterface.MarkModuleScopedPermission(MODULE_PAGE_PERMISSION);
    permissionsInterface.RegisterPermission(REGULAR_PERMISSION, {
      id: REGULAR_PERMISSION,
      title: "Regular page",
    });
  });

  it("keeps granting everything to the owner wildcard", async () => {
    expect(
      await HasPermission(new Set(["*"]), MODULE_PAGE_PERMISSION),
    ).to.equal(true);
    expect(
      await HasPermission(new Set(["*"]), MODULE_ACTION_PERMISSION),
    ).to.equal(true);
  });

  it("denies a module permission even when the role grants its literal id", async () => {
    const granted = new Set([MODULE_PAGE_PERMISSION]);
    expect(await HasPermission(granted, MODULE_PAGE_PERMISSION)).to.equal(
      false,
    );
  });

  it("denies descendants of a module permission (component/action routes)", async () => {
    const granted = new Set([MODULE_ACTION_PERMISSION]);
    expect(await HasPermission(granted, MODULE_ACTION_PERMISSION)).to.equal(
      false,
    );
  });

  it("keeps granting non-module permissions exactly as before", async () => {
    expect(
      await HasPermission(new Set([REGULAR_PERMISSION]), REGULAR_PERMISSION),
    ).to.equal(true);
    expect(await HasPermission(new Set(), REGULAR_PERMISSION)).to.equal(false);
  });
});
