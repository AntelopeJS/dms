import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  userCanAccessPage,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterModule,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { stubPageAccessModels } from "../../../helpers/page-access";

const MODULE_ID = "ucap-mod";
const TENANT_ID = "ucap-tenant";
const MODULE_PAGE_FULL_ID = `modules.${MODULE_ID}.ucap-page`;
const REGULAR_PAGE_FULL_ID = "pages.ucap-normal";

describe("[unit] implementations/dms/page — userCanAccessPage module gating", () => {
  before(async () => {
    // Wire the mocha-loaded interface proxies to the mocha-loaded
    // implementation so registered pages land in its page registry.
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    RegisterModule({
      id: MODULE_ID,
      title: "Realtime test module",
      description: "Module used by userCanAccessPage tests",
      icon: "i-ph-cube",
    });

    const modulePage = PageController("ucap-page", {
      displayName: "Module page",
      module: MODULE_ID,
    });
    await GetMetadata(modulePage, PageMetadata).Register();

    const regularPage = PageController("ucap-normal", {
      displayName: "Regular page",
      category: pagesCategory,
    });
    await GetMetadata(regularPage, PageMetadata).Register();
  });

  it("denies a non-owner whose role grants the module page permission", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([
      MODULE_PAGE_FULL_ID,
    ]);
    const nonOwner = { _id: "user-1" } as User;
    expect(
      await userCanAccessPage(
        nonOwner,
        MODULE_PAGE_FULL_ID,
        memberModel,
        roleModel,
        TENANT_ID,
      ),
    ).to.equal(false);
  });

  it("allows the platform owner on a module page", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const owner = { _id: "user-2", owner: true } as User;
    expect(
      await userCanAccessPage(
        owner,
        MODULE_PAGE_FULL_ID,
        memberModel,
        roleModel,
        TENANT_ID,
      ),
    ).to.equal(true);
  });

  it("denies unauthenticated access to a module page", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    expect(
      await userCanAccessPage(
        undefined,
        MODULE_PAGE_FULL_ID,
        memberModel,
        roleModel,
        TENANT_ID,
      ),
    ).to.equal(false);
  });

  it("unmarks a module page permission when the page unregisters (hot reload)", async () => {
    // Default ids stay covered by the still-marked module root prefix, so
    // the stale-deny scenario is only observable for a custom permission id
    // living outside the modules.* namespace — exactly what unregister must
    // release.
    const customPermissionId = "ucap-custom-perm";
    const reloadedPage = PageController("ucap-reloaded", {
      displayName: "Reloaded module page",
      module: MODULE_ID,
      permission: { id: customPermissionId },
    });
    const meta = GetMetadata(reloadedPage, PageMetadata);
    await meta.Register();
    expect(
      permissionsInterface.IsModuleScopedPermission(customPermissionId),
    ).to.equal(true);

    if (!meta.pageInfo) throw new Error("pageInfo not initialized");
    pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);
    expect(
      permissionsInterface.IsModuleScopedPermission(customPermissionId),
    ).to.equal(false);
  });

  it("keeps granting access to regular pages through role permissions", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([
      REGULAR_PAGE_FULL_ID,
    ]);
    const nonOwner = { _id: "user-3" } as User;
    expect(
      await userCanAccessPage(
        nonOwner,
        REGULAR_PAGE_FULL_ID,
        memberModel,
        roleModel,
        TENANT_ID,
      ),
    ).to.equal(true);
  });
});
