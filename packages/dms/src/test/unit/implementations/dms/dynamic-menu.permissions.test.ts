import { expect } from "chai";
import { buildSiteLayoutPayload } from "../../../../implementations/dms/page";
import {
  PageController,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import {
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";
import {
  BYPASS_TARGET_ACTION,
  CATEGORY_FULL_ID,
  CATEGORY_ID,
  cleanups,
  DENIED_TENANT,
  denyingGate,
  OWNER,
  PAGE_SLUG,
  registerMenuFixtures,
  registerProvider,
  resolveCategoryNode,
  RESTRICTED_PERMISSION,
  runCleanups,
  runSuiteCleanups,
  TENANT_A,
} from "../../../helpers/dynamic-menu-fixtures";

describe("[unit] implementations/dms/page — dynamic menu providers, under a gate-bypassing category", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("keeps the caller's real permissions under a gate-bypassing category", async () => {
    const bypassCategory = registerTestCategory("dyn-bypass", {
      displayName: "Recovery",
      category: pagesCategory,
      type: "label",
      bypassTenantAccessGate: true,
    });
    cleanups.push(bypassCategory.cleanup);
    const bypassPage = PageController("dyn-bypass-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));

    let resolverPermissions: Set<string> | undefined;
    cleanups.push(
      RegisterDynamicMenuProvider(
        bypassCategory.category.fullId,
        (_user, _t, perms) => {
          resolverPermissions = perms;
          return [
            {
              id: "recover",
              displayName: "Recover",
              fullSlug: "/dyn-bypass-target",
              permissionId: BYPASS_TARGET_ACTION,
            },
          ];
        },
      ),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      bypassCategory.category.fullId,
      "pages.dyn-bypass-target",
      BYPASS_TARGET_ACTION,
      RESTRICTED_PERMISSION,
    ]);
    const member = userFixture({ _id: "dyn-suspended" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node = payload.siteLayoutTree.children.pages?.children["dyn-bypass"];

    expect(resolverPermissions?.has(RESTRICTED_PERMISSION)).to.equal(true);
    expect(node?.childrenOrders).to.deep.equal(["recover"]);
  });
});

describe("[unit] implementations/dms/page — dynamic menu providers, permission sets", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("hides an entry the caller's permission set cannot explain", async () => {
    const publicCategory = registerTestCategory("dyn-public", {
      displayName: "Recovery links",
      category: pagesCategory,
      type: "label",
      publicAccess: true,
    });
    cleanups.push(publicCategory.cleanup);
    const bypassPage = PageController("dyn-public-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));

    cleanups.push(
      RegisterDynamicMenuProvider(publicCategory.category.fullId, () => [
        {
          id: "settle",
          displayName: "Settle invoice",
          fullSlug: "/dyn-public-target",
          permissionId: RESTRICTED_PERMISSION,
        },
      ]),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      "pages.dyn-public-target",
      RESTRICTED_PERMISSION,
    ]);
    const member = userFixture({ _id: "dyn-suspended-member" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node = payload.siteLayoutTree.children.pages?.children["dyn-public"];

    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("keeps an entry whose permission belongs to the flagged page", async () => {
    const publicCategory = registerTestCategory("dyn-public-kept", {
      displayName: "Recovery links",
      category: pagesCategory,
      type: "label",
      publicAccess: true,
    });
    cleanups.push(publicCategory.cleanup);
    const bypassPage = PageController("dyn-kept-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));
    const settlePermission = "pages.dyn-kept-target.settle";

    cleanups.push(
      RegisterDynamicMenuProvider(publicCategory.category.fullId, () => [
        {
          id: "settle",
          displayName: "Settle invoice",
          fullSlug: "/dyn-kept-target",
          permissionId: settlePermission,
        },
      ]),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      "pages.dyn-kept-target",
      settlePermission,
    ]);
    const member = userFixture({ _id: "dyn-suspended-owner" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node =
      payload.siteLayoutTree.children.pages?.children["dyn-public-kept"];

    expect(node?.childrenOrders).to.deep.equal(["settle"]);
  });
});

describe("[unit] implementations/dms/page — dynamic menu providers, defaultGranted and owner wildcard", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("hides an entry granted only by a defaultGranted permission", async () => {
    const openPage = PageController("dyn-default-granted", {
      displayName: "Open page",
      category: pagesCategory,
      hidden: true,
      publicAccess: true,
    });
    cleanups.push(await registerTestPage(openPage));

    cleanups.push(
      registerProvider(() => [
        {
          id: "default-granted",
          displayName: "Granted by default",
          fullSlug: PAGE_SLUG,
          permissionId: "pages.dyn-default-granted",
        },
      ]),
    );

    const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
    const member = userFixture({ _id: "dyn-plain-member" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("keeps an entry the owner wildcard covers", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "owner-only",
          displayName: "Owner only",
          fullSlug: PAGE_SLUG,
          permissionId: RESTRICTED_PERMISSION,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["owner-only"]);
  });
});
