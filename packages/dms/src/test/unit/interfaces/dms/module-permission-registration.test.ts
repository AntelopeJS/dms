import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import {
  Category,
  modulesCategory,
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterModule,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { IsModuleScopedPermission } from "@antelopejs/interface-dms/permissions";

const MODULE_ID = "mpr-testmod";
const MODULE_ROOT_PERMISSION = `modules.${MODULE_ID}`;
const MODULE_PAGE_PERMISSION = `modules.${MODULE_ID}.mpr-page`;
const MODULE_CATEGORY_PERMISSION = `modules.${MODULE_ID}.mpr-cat`;
const REGULAR_PAGE_PERMISSION = "pages.mpr-normal";

describe("[unit] interfaces/dms/page — module permission registration", () => {
  before(async () => {
    // Route the interface-side RegisterPermission proxy into the mocha-loaded
    // registry implementation; the proxy replays registrations that happened
    // at import time (built-in root categories, settings pages, ...).
    ImplementInterface(permissionsInterface, permissionsImpl);

    // The built-in Modules landing page is normally registered by
    // src/pages/modules/modules-index.ts; register it here so this suite does
    // not depend on other test files importing the full module.
    await GetMetadata(modulesCategory, PageMetadata).Register();

    RegisterModule({
      id: MODULE_ID,
      title: "Test module",
      description: "Module used by registration tests",
      icon: "i-ph-cube",
    });
    Category("mpr-cat", {
      displayName: "Module category",
      module: MODULE_ID,
    });

    const modulePage = PageController("mpr-page", {
      displayName: "Module page",
      module: MODULE_ID,
    });
    await GetMetadata(modulePage, PageMetadata).Register();

    const regularPage = PageController("mpr-normal", {
      displayName: "Regular page",
      category: pagesCategory,
    });
    await GetMetadata(regularPage, PageMetadata).Register();
  });

  it("does not register the built-in Modules root into the permission registry", () => {
    expect(permissionsImpl.GetPermission("modules")).to.equal(undefined);
    expect(IsModuleScopedPermission("modules")).to.equal(true);
  });

  it("does not register module root, category, or page permissions", () => {
    expect(permissionsImpl.GetPermission(MODULE_ROOT_PERMISSION)).to.equal(
      undefined,
    );
    expect(permissionsImpl.GetPermission(MODULE_CATEGORY_PERMISSION)).to.equal(
      undefined,
    );
    expect(permissionsImpl.GetPermission(MODULE_PAGE_PERMISSION)).to.equal(
      undefined,
    );
  });

  it("marks module ids so descendants (components/actions) are denied too", () => {
    expect(IsModuleScopedPermission(MODULE_PAGE_PERMISSION)).to.equal(true);
    expect(
      IsModuleScopedPermission(`${MODULE_PAGE_PERMISSION}.table.add`),
    ).to.equal(true);
    expect(IsModuleScopedPermission(MODULE_CATEGORY_PERMISSION)).to.equal(true);
  });

  it("keeps the permission tree free of any module entry", () => {
    const tree = permissionsImpl.GetPermissions();
    expect(tree).to.not.have.property("modules");
  });

  it("still registers regular page permissions", () => {
    expect(permissionsImpl.GetPermission(REGULAR_PAGE_PERMISSION)).to.not.equal(
      undefined,
    );
    expect(IsModuleScopedPermission(REGULAR_PAGE_PERMISSION)).to.equal(false);
    expect(permissionsImpl.GetPermissions()).to.have.property("pages");
  });
});
