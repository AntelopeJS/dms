import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  internal as pageImplInternal,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
  RegisterPage,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { stubPageAccessModels } from "../../../helpers/page-access";

const TENANT = "hidden-blocks-tenant";
const MEMBER = { _id: "hidden-blocks-member" } as User;
const BLOCKS_PAGE_ID = "pages.hidden-blocks";
const BARE_PAGE_ID = "pages.hidden-blocks-bare";

function block(tag: string) {
  return new ComponentBuilder<{ tag: string }>("hidden-blocks-block").options({
    tag,
  });
}

class BlocksPage extends PageController("hidden-blocks", {
  displayName: "Overview",
  category: pagesCategory,
}) {
  static hero = block("hero");
  static stats = block("stats");
}

class BarePage extends PageController("hidden-blocks-bare", {
  displayName: "Welcome",
  category: pagesCategory,
}) {}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Through `RegisterPage`, which collects the static components:
// `registerTestPage` alone would register the page without its blocks.
function registerPage(page: ControllerClass): () => void {
  RegisterPage()(page);
  return () => {
    const { pageInfo } = GetMetadata(page, PageMetadata);
    if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
  };
}

async function servedLayout(slug: string, permissions: string[]) {
  const { memberModel, roleModel } = stubPageAccessModels(permissions);
  const payload = await buildPagePayload(
    slug,
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
    false,
  );
  return payload.layout;
}

// A role granting a page but none of its blocks was served an empty layout the
// browser drew as a blank page, exactly like a page declaring no block at all.
describe("[unit] interface-dms/page — a layout whose every component is hidden", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    cleanups.push(registerPage(BlocksPage), registerPage(BarePage));
    await settle();
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("says so when the caller may see none of the page's components", async () => {
    const layout = await servedLayout("/hidden-blocks", [BLOCKS_PAGE_ID]);

    expect(layout.components).to.deep.equal({});
    expect(layout.allComponentsHidden).to.equal(true);
  });

  it("stays silent while one component is served", async () => {
    const layout = await servedLayout("/hidden-blocks", [
      BLOCKS_PAGE_ID,
      `${BLOCKS_PAGE_ID}.stats`,
    ]);

    expect(Object.keys(layout.components)).to.deep.equal(["stats"]);
    expect(layout).to.not.have.property("allComponentsHidden");
  });

  it("stays silent on a page that declares no component", async () => {
    const layout = await servedLayout("/hidden-blocks-bare", [BARE_PAGE_ID]);

    expect(layout.components).to.deep.equal({});
    expect(layout).to.not.have.property("allComponentsHidden");
  });
});
