import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { RoleModel } from "@antelopejs/interface-dms/db";
import {
  type PageInfo,
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  userCanAccessPage,
} from "../../../implementations/dms/page";
import * as permissionsImpl from "../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../implementations/dms/tenant-access";
import { roleOpensPage } from "../../../mcp/page-verify";
import {
  registerTestPage,
  stubExactPermissionModels,
} from "../../helpers/page-access";
import { userFixture } from "../../helpers/user-fixture";

const TENANT = "pvw-tenant";
const PAGE_ID = "pages.pvw-page";
const OWNER = userFixture({ _id: "pvw-owner", owner: true });
const MEMBER = userFixture({ _id: "pvw-member" });

class WildcardPage extends PageController("pvw-page", {
  displayName: "Page",
  category: pagesCategory,
}) {}

function pageInfo(): PageInfo {
  const info = GetMetadata(WildcardPage, PageMetadata).pageInfo;
  if (!info) throw new Error("the page is not registered");
  return info;
}

/** What page_verify expects for `permissions`, and what a member holding them is served. */
async function expectedAndServed(
  permissions: string[],
): Promise<{ expected: boolean; served: boolean }> {
  const role = RoleModel.fromPlainData({ _id: "pvw-role", permissions });
  const { memberModel, roleModel } = stubExactPermissionModels(permissions);
  const workspace = {
    tenantId: TENANT,
    owner: OWNER,
    roles: [role],
    memberByRole: new Map(),
  };
  return {
    expected: await roleOpensPage(workspace, role, pageInfo()),
    served: await userCanAccessPage(
      MEMBER,
      PAGE_ID,
      memberModel,
      roleModel,
      TENANT,
    ),
  };
}

describe("[unit] mcp page_verify — a role whose stored permissions list *", () => {
  let unregister: () => void = () => undefined;

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    unregister = await registerTestPage(WildcardPage);
  });

  after(() => unregister());

  it("is expected refused, as a member holding it is", async () => {
    expect(await expectedAndServed(["*"])).to.deep.equal({
      expected: false,
      served: false,
    });
  });

  it("is expected to open the page its other ids grant", async () => {
    expect(await expectedAndServed(["*", "pages", PAGE_ID])).to.deep.equal({
      expected: true,
      served: true,
    });
  });
});
