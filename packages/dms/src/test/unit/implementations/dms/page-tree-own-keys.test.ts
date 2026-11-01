import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  type CategoryInfo,
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
  cancelMissingCategoryCheck,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import { captureWarnings } from "../../../helpers/logging";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";

const TENANT = "page-tree-own-keys-tenant";
const MEMBER = userFixture({ _id: "page-tree-own-keys-member" });

function unregisteredCategory(id: string): CategoryInfo {
  return {
    id,
    fullId: `${pagesCategory.fullId}.${id}`,
    fullSlug: "/prototype-key-category",
    displayName: id,
    category: pagesCategory,
  };
}

describe("[unit] implementations/dms/page — segments named like Object.prototype keys", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  it("lists a page under a never-registered category named constructor", async () => {
    const captured = captureWarnings();
    let removePage: () => void = () => undefined;
    try {
      removePage = await registerTestPage(
        PageController("prototype-key-sales", {
          displayName: "Prototype key sales",
          category: unregisteredCategory("constructor"),
        }),
      );
      const { memberModel, roleModel } = stubPageAccessModels(["*"]);
      const payload = await buildSiteLayoutPayload(
        MEMBER,
        memberModel,
        roleModel,
        TENANT,
      );
      const pages = payload.siteLayoutTree.children[pagesCategory.id];
      expect(pages?.children["prototype-key-sales"]?.fullId).to.equal(
        "pages.constructor.prototype-key-sales",
      );
    } finally {
      cancelMissingCategoryCheck();
      captured.restore();
      removePage();
    }
  });
});
