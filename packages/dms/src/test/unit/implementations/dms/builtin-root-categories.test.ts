import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
  type SiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterBuiltInCategories,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  registerTestCategory,
  stubPageAccessModels,
} from "../../../helpers/page-access";

type LayoutTree = SiteLayoutPayload["siteLayoutTree"];

const TENANT = "builtin-root-tenant";
const MEMBER = { _id: "builtin-root-member" } as User;
const EVERY_PERMISSION = ["*"];
const PLACEHOLDER_NAME = "none";

async function rootNode(id: string): Promise<LayoutTree | undefined> {
  const { memberModel, roleModel } = stubPageAccessModels(EVERY_PERMISSION);
  const layout = await buildSiteLayoutPayload(
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
  );
  return layout.siteLayoutTree.children[id];
}

describe("[unit] implementations/dms/page — built-in root categories", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    RegisterBuiltInCategories();
  });

  it("builds a root category without registering it until asked", async () => {
    const defined = pageInterfaceInternal.DefineRootCategory("defined-root", {
      displayName: "Defined root",
      type: "label",
    });
    expect(await rootNode("defined-root")).to.equal(undefined);

    pageInterfaceInternal.RegisterRootCategory(defined);
    try {
      expect((await rootNode("defined-root"))?.displayName).to.equal(
        "Defined root",
      );
    } finally {
      pageInterfaceInternal.RegisterCategory.unregister(defined);
    }
  });

  // The pages root used to be registered as an import side effect of this
  // interface package, owned by whichever module imported it first. That
  // module's first hot reload unregistered it and nothing registered it again:
  // the sidebar showed its pages under a placeholder named "none".
  it("comes back as itself when the next DMS generation registers it again", async () => {
    const child = registerTestCategory("builtin-root-child", {
      displayName: "Child section",
      category: pagesCategory,
    });
    try {
      pageInterfaceInternal.RegisterCategory.unregister(pagesCategory);
      expect((await rootNode("pages"))?.displayName).to.equal(PLACEHOLDER_NAME);

      RegisterBuiltInCategories();

      const pages = await rootNode("pages");
      expect(pages?.id).to.equal("pages");
      expect(pages?.displayName).to.equal(pagesCategory.displayName);
      expect(pages?.children).to.have.property("builtin-root-child");
    } finally {
      child.cleanup();
      RegisterBuiltInCategories();
    }
  });
});
