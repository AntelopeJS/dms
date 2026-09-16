import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { GetPermission } from "@antelopejs/interface-dms/permissions";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";

const PAGE_ID = "teardown-page";
const PAGE_FULL_ID = `pages.${PAGE_ID}`;
const COMPONENT_KEY = "panel";
const COMPONENT_PERMISSION_ID = `${PAGE_FULL_ID}.${COMPONENT_KEY}`;

class PageWithComponent extends PageController(PAGE_ID, {
  displayName: "Teardown page",
  category: pagesCategory,
}) {
  static panel = CustomComponent("TeardownPanel").meta({
    name: "Panel",
    icon: "i-ph-square",
  });
}

describe("[unit] interfaces/dms/page — a page takes its permissions down with it", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  it("registers the page and component permissions, then releases both", async () => {
    const meta = GetMetadata(PageWithComponent, PageMetadata);
    // What `@RegisterPage` does with the class's static component fields.
    meta.SetComponent(COMPONENT_KEY, PageWithComponent.panel);
    await meta.Register();

    expect((await GetPermission(PAGE_FULL_ID))?.id).to.equal(PAGE_FULL_ID);
    expect((await GetPermission(COMPONENT_PERMISSION_ID))?.id).to.equal(
      COMPONENT_PERMISSION_ID,
    );

    if (!meta.pageInfo) throw new Error("pageInfo not initialized");
    pageInterfaceInternal.RegisterPage.unregister(meta.pageInfo);

    // Left behind, these outlive the page: the roles tree keeps offering them
    // and `HasPermission` keeps answering for a surface that no longer serves.
    expect(await GetPermission(PAGE_FULL_ID)).to.equal(undefined);
    expect(await GetPermission(COMPONENT_PERMISSION_ID)).to.equal(undefined);
  });
});
