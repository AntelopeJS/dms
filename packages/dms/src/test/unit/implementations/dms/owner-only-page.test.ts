import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  userCanAccessPage,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  internal as pageInterfaceInternal,
  PageController,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { IsModuleScopedPermission } from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import {
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";

const TENANT_ID = "oop-tenant";
const CATEGORY = "pages.oop-dev";
const INHERITED_PAGE = `${CATEGORY}.oop-inherited`;
const PUBLIC_PAGE = "pages.oop-public";

async function canOpen(
  user: Parameters<typeof userCanAccessPage>[0],
  fullId: string,
  granted: string[],
): Promise<boolean> {
  const { memberModel, roleModel } = stubPageAccessModels(granted);
  return userCanAccessPage(user, fullId, memberModel, roleModel, TENANT_ID);
}

describe("[unit] implementations/dms/page — ownerOnly pages", () => {
  const cleanups: (() => void)[] = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const dev = registerTestCategory("oop-dev", {
      displayName: "Dev",
      category: pagesCategory,
      ownerOnly: true,
    });
    cleanups.push(dev.cleanup);
    cleanups.push(
      await registerTestPage(
        PageController("oop-inherited", {
          displayName: "Inherited",
          category: dev.category,
        }),
      ),
      await registerTestPage(
        PageController("oop-public", {
          displayName: "Public, owner only",
          category: pagesCategory,
          publicAccess: true,
          ownerOnly: true,
        }),
      ),
    );
  });

  after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
  });

  it("registers no grantable permission for the category or a page under it", () => {
    expect(permissionsImpl.GetPermission(CATEGORY)).to.equal(undefined);
    expect(permissionsImpl.GetPermission(INHERITED_PAGE)).to.equal(undefined);
    expect(IsModuleScopedPermission(`${INHERITED_PAGE}.block`)).to.equal(true);
  });

  it("denies a member granted the inherited page, and opens it to the owner", async () => {
    const member = userFixture({ _id: "oop-member" });
    const owner = userFixture({ _id: "oop-owner", owner: true });
    expect(await canOpen(member, INHERITED_PAGE, [INHERITED_PAGE])).to.equal(
      false,
    );
    expect(await canOpen(owner, INHERITED_PAGE, [])).to.equal(true);
  });

  it("wins over publicAccess: an anonymous caller is refused", async () => {
    expect(await canOpen(undefined, PUBLIC_PAGE, [])).to.equal(false);
    expect(permissionsImpl.GetPermission(PUBLIC_PAGE)).to.equal(undefined);
  });

  it("frees its permission id when the page unregisters", async () => {
    const remove = await registerTestPage(
      PageController("oop-reloaded", {
        displayName: "Reloaded",
        category: pagesCategory,
        ownerOnly: true,
      }),
    );
    expect(IsModuleScopedPermission("pages.oop-reloaded")).to.equal(true);
    remove();
    expect(IsModuleScopedPermission("pages.oop-reloaded")).to.equal(false);
  });
});
