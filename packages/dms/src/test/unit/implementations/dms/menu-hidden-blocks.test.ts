import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  buildSiteLayoutPayload,
  internal as pageImplInternal,
  resolvePermissionPreviewAccess,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
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

const TENANT = "mhb-tenant";
const MEMBER = { _id: "mhb-member" } as User;
const OWNER = { _id: "mhb-owner", owner: true } as User;
const BLOCKS_PAGE = "pages.mhb-blocks";
const NESTED_PAGE = `${BLOCKS_PAGE}.mhb-nested`;
const BARE_PAGE = "pages.mhb-bare";

function block(tag: string) {
  return new ComponentBuilder<{ tag: string }>("mhb-block").options({ tag });
}

class BlocksPage extends PageController("mhb-blocks", {
  displayName: "Members",
  category: pagesCategory,
}) {
  static table = block("table");
  static quota = block("quota");
}

// Filed under the page, like Member invitations under Members.
class NestedPage extends PageController("mhb-nested", {
  displayName: "Invitations",
  category: BlocksPage,
}) {
  static list = block("list");
}

class BarePage extends PageController("mhb-bare", {
  displayName: "Welcome",
  category: pagesCategory,
}) {}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function registerPage(page: ControllerClass): () => void {
  RegisterPage()(page);
  return () => {
    const { pageInfo } = GetMetadata(page, PageMetadata);
    if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
  };
}

async function pagesLevelFor(permissions: string[]) {
  const { memberModel, roleModel } = stubPageAccessModels(permissions);
  const payload = await buildSiteLayoutPayload(
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
  );
  return payload.siteLayoutTree.children[pagesCategory.id]?.children ?? {};
}

async function previewHiddenEntries(permissions: string[]): Promise<string[]> {
  const { memberModel, roleModel } = stubPageAccessModels([]);
  const access = await resolvePermissionPreviewAccess({
    user: OWNER,
    memberModel,
    roleModel,
    tenantId: TENANT,
    previewPermissions: new Set(withPermissionAncestors(permissions)),
  });
  return access.hiddenEntries;
}

// A role holding a page but none of its blocks was served the page as a menu
// entry, which opened on "nothing to show for you" — an Invitations-only role
// got a dead Members entry in the settings navigation.
describe("[unit] implementations/dms/page — a page whose every block is hidden", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    cleanups.push(registerPage(BlocksPage));
    await settle();
    cleanups.push(registerPage(NestedPage), registerPage(BarePage));
    await settle();
  });

  after(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  });

  it("is left out of the menu, its name kept", async () => {
    const pages = await pagesLevelFor([BLOCKS_PAGE]);

    expect(pages["mhb-blocks"]?.hasAccess).to.equal(false);
    expect(pages["mhb-blocks"]?.displayName).to.equal("Members");
  });

  it("stays in the menu while one block is visible", async () => {
    const pages = await pagesLevelFor([`${BLOCKS_PAGE}.quota`]);

    expect(pages["mhb-blocks"]?.hasAccess).to.equal(true);
  });

  it("keeps the entry of a page nested under it that the member can open", async () => {
    const pages = await pagesLevelFor([`${NESTED_PAGE}.list`]);
    const page = pages["mhb-blocks"];

    expect(page?.hasAccess).to.equal(false);
    expect(page?.children["mhb-nested"]?.hasAccess).to.equal(true);
  });

  it("never leaves out a page that declares no block", async () => {
    const pages = await pagesLevelFor([BARE_PAGE]);

    expect(pages["mhb-bare"]?.hasAccess).to.equal(true);
  });

  it("still opens by its URL, on the nothing-to-show state", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([BLOCKS_PAGE]);
    const payload = await buildPagePayload(
      "/mhb-blocks",
      MEMBER,
      memberModel,
      roleModel,
      TENANT,
      false,
    );

    expect(payload.route.hasAccess).to.equal(true);
    expect(payload.layout.allComponentsHidden).to.equal(true);
  });

  it("matches what the role preview locks", async () => {
    expect(await previewHiddenEntries([BLOCKS_PAGE])).to.include(BLOCKS_PAGE);
    expect(await previewHiddenEntries([`${BLOCKS_PAGE}.quota`])).to.not.include(
      BLOCKS_PAGE,
    );
  });
});
