import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
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

const LABEL_ID = "pv-label";
const LABEL_FULL_ID = `pages.${LABEL_ID}`;
const PAGE_FULL_ID = `${LABEL_FULL_ID}.pv-page`;
const TARGET_FULL_ID = "pages.pv-target";
const TARGET_SLUG = "/pv-target";
const ENTRY_PERMISSION = "pv.entry-permission";
const OPEN_ENTRY_FULL_ID = `${LABEL_FULL_ID}.open-entry`;
const GUARDED_ENTRY_FULL_ID = `${LABEL_FULL_ID}.guarded-entry`;
const TENANT = "pv-tenant";
// A platform owner reaches every entry: the preview compares all of them.
const OWNER = { _id: "pv-owner", owner: true } as User;

async function hiddenEntriesFor(permissions: string[]): Promise<string[]> {
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

describe("[unit] implementations/dms/page — permission preview of the menu", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    // A label category with no URL of its own (URL-transparent): drawn in the
    // menu, never navigable — the kind the preview used to leave unlocked.
    const label = registerTestCategory(LABEL_ID, {
      displayName: "Preview label",
      category: pagesCategory,
      type: "label",
      urlSlug: "/",
    });
    cleanups.push(label.cleanup);
    cleanups.push(
      await registerTestPage(
        PageController("pv-page", {
          displayName: "Preview page",
          category: label.category,
        }),
      ),
    );
    cleanups.push(
      await registerTestPage(
        PageController("pv-target", {
          displayName: "Preview target",
          category: pagesCategory,
          hidden: true,
        }),
      ),
    );
    cleanups.push(
      RegisterDynamicMenuProvider(LABEL_FULL_ID, () => [
        { id: "open-entry", displayName: "Open", fullSlug: TARGET_SLUG },
        {
          id: "guarded-entry",
          displayName: "Guarded",
          fullSlug: TARGET_SLUG,
          permissionId: ENTRY_PERMISSION,
        },
      ]),
    );
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it("locks a label category the previewed set cannot reach", async () => {
    const hidden = await hiddenEntriesFor([]);
    expect(hidden).to.include.members([LABEL_FULL_ID, PAGE_FULL_ID]);
  });

  it("leaves a label category and its page unlocked when the set grants them", async () => {
    const hidden = await hiddenEntriesFor([LABEL_FULL_ID, PAGE_FULL_ID]);
    expect(hidden).to.not.include(LABEL_FULL_ID);
    expect(hidden).to.not.include(PAGE_FULL_ID);
  });

  it("locks the dynamic entries whose target page the set cannot open", async () => {
    const hidden = await hiddenEntriesFor([LABEL_FULL_ID, ENTRY_PERMISSION]);
    expect(hidden).to.include.members([
      OPEN_ENTRY_FULL_ID,
      GUARDED_ENTRY_FULL_ID,
    ]);
  });

  it("locks only the dynamic entry whose own permission the set lacks", async () => {
    const hidden = await hiddenEntriesFor([LABEL_FULL_ID, TARGET_FULL_ID]);
    expect(hidden).to.include(GUARDED_ENTRY_FULL_ID);
    expect(hidden).to.not.include(OPEN_ENTRY_FULL_ID);
  });

  it("draws partial the entries whose page loses something, and their group", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const access = await resolvePermissionPreviewAccess({
      user: OWNER,
      memberModel,
      roleModel,
      tenantId: TENANT,
      previewPermissions: new Set([
        LABEL_FULL_ID,
        PAGE_FULL_ID,
        TARGET_FULL_ID,
        ENTRY_PERMISSION,
      ]),
      pageLoses: async (page) => page.fullId === TARGET_FULL_ID,
    });
    expect(access.partialEntries).to.include.members([
      LABEL_FULL_ID,
      OPEN_ENTRY_FULL_ID,
      GUARDED_ENTRY_FULL_ID,
    ]);
    expect(access.partialEntries).to.not.include(PAGE_FULL_ID);
    expect(access.hiddenEntries).to.not.include(LABEL_FULL_ID);
  });

  it("refuses a group whose every entry the set is refused", async () => {
    const hidden = await hiddenEntriesFor([LABEL_FULL_ID]);
    expect(hidden).to.include(LABEL_FULL_ID);
  });

  it("locks every dynamic entry of a category the set cannot reach", async () => {
    const hidden = await hiddenEntriesFor([TARGET_FULL_ID, ENTRY_PERMISSION]);
    expect(hidden).to.include.members([
      LABEL_FULL_ID,
      OPEN_ENTRY_FULL_ID,
      GUARDED_ENTRY_FULL_ID,
    ]);
  });
});
