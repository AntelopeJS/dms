import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildSiteLayoutPayload,
  internal as pageImplInternal,
  resolvePermissionPreviewAccess,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const GROUP_ID = "emg-group";
const GROUP_FULL_ID = `pages.${GROUP_ID}`;
const PAGE_FULL_ID = `${GROUP_FULL_ID}.emg-page`;
const DYNAMIC_GROUP_ID = "emg-dynamic";
const DYNAMIC_GROUP_FULL_ID = `pages.${DYNAMIC_GROUP_ID}`;
const TENANT = "emg-tenant";
const MEMBER = { _id: "emg-member" } as User;
const OWNER = { _id: "emg-owner", owner: true } as User;

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
    previewPermissions: new Set(permissions),
  });
  return access.hiddenEntries;
}

// A role granting a menu group but none of its pages: the member used to be
// served the group as reachable, an entry a click did nothing on, while the
// role preview drew it locked.
describe("[unit] implementations/dms/page — a menu group without a reachable page", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const group = registerTestCategory(GROUP_ID, {
      displayName: "Charts",
      category: pagesCategory,
    });
    cleanups.push(group.cleanup);
    cleanups.push(
      await registerTestPage(
        PageController("emg-page", {
          displayName: "Line chart",
          category: group.category,
        }),
      ),
    );
    const dynamicGroup = registerTestCategory(DYNAMIC_GROUP_ID, {
      displayName: "Projects",
      category: pagesCategory,
    });
    cleanups.push(dynamicGroup.cleanup);
    cleanups.push(RegisterDynamicMenuProvider(DYNAMIC_GROUP_FULL_ID, () => []));
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("is not served as reachable to a member granted only the group", async () => {
    const pages = await pagesLevelFor([pagesCategory.fullId, GROUP_FULL_ID]);
    const group = pages[GROUP_ID];

    expect(group?.hasAccess).to.equal(false);
    expect(group?.children["emg-page"]?.hasAccess).to.equal(false);
  });

  it("keeps the name it was granted", async () => {
    const pages = await pagesLevelFor([pagesCategory.fullId, GROUP_FULL_ID]);
    expect(pages[GROUP_ID]?.displayName).to.equal("Charts");
  });

  it("is served as reachable once one of its pages is", async () => {
    const pages = await pagesLevelFor([
      pagesCategory.fullId,
      GROUP_FULL_ID,
      PAGE_FULL_ID,
    ]);
    expect(pages[GROUP_ID]?.hasAccess).to.equal(true);
  });

  it("is not served as reachable when its provider lists nothing for the member", async () => {
    const pages = await pagesLevelFor([
      pagesCategory.fullId,
      DYNAMIC_GROUP_FULL_ID,
    ]);
    expect(pages[DYNAMIC_GROUP_ID]?.hasAccess).to.equal(false);
  });

  it("matches what the role preview locks", async () => {
    const granted = [pagesCategory.fullId, GROUP_FULL_ID];
    const [pages, hidden] = await Promise.all([
      pagesLevelFor(granted),
      previewHiddenEntries(granted),
    ]);

    expect(hidden).to.include(GROUP_FULL_ID);
    expect(pages[GROUP_ID]?.hasAccess).to.equal(false);
  });
});
