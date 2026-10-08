import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import type { ControllerClass } from "@antelopejs/interface-api";
import { expect } from "chai";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPage,
  settingsCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { HasPermission } from "@antelopejs/interface-dms/permissions";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { collectGrantablePermissionIds } from "../../../../pages/settings/users/member-role-options";
import { registerTestCategory } from "../../../helpers/page-access";

const CATEGORY_ID = "pages.ma-personal";
const PAGE_ID = `${CATEGORY_ID}.ma-inbox`;
const COMPONENT_ID = `${PAGE_ID}.feed`;
const ACTION_ID = `${COMPONENT_ID}.archive`;
const GRANTED_PAGE_ID = "pages.ma-granted";
const SETTINGS_PAGE_ID = "settings.ma-billing";
const NESTED_PAGE_ID = `${PAGE_ID}.ma-archive`;
const NO_PERMISSIONS = new Set<string>();

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function feed() {
  return CustomComponent("MaFeed")
    .meta({ name: "Feed" })
    .action("archive", { title: "Archive" });
}

function unregisterPage(page: ControllerClass): void {
  const { pageInfo } = GetMetadata(page, PageMetadata);
  if (pageInfo) pageInterface.internal.RegisterPage.unregister(pageInfo);
}

describe("[unit] interfaces/dms/page — memberAccess", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterface, pageImpl);
    const personal = registerTestCategory("ma-personal", {
      displayName: "Personal",
      category: pagesCategory,
      memberAccess: true,
    });
    cleanups.push(personal.cleanup);

    class InboxPage extends PageController("ma-inbox", {
      displayName: "Inbox",
      category: personal.category,
    }) {
      static feed = feed();
    }

    class GrantedPage extends PageController("ma-granted", {
      displayName: "Granted",
      category: pagesCategory,
    }) {
      static feed = feed();
    }

    // Declared on the settings root itself, which every member opens.
    class SettingsPage extends PageController("ma-billing", {
      displayName: "Billing",
      category: settingsCategory,
    }) {
      static feed = feed();
    }

    class NestedPage extends PageController("ma-archive", {
      displayName: "Archive",
      category: InboxPage,
    }) {
      static feed = feed();
    }
    for (const page of [InboxPage, GrantedPage, SettingsPage, NestedPage]) {
      RegisterPage()(page);
      cleanups.push(() => unregisterPage(page));
    }
    await settle();
  });

  after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
  });

  it("lets a member without a role hold the category, its pages, components and actions", async () => {
    for (const id of [CATEGORY_ID, PAGE_ID, COMPONENT_ID, ACTION_ID]) {
      expect(await HasPermission(NO_PERMISSIONS, id), id).to.equal(true);
    }
  });

  it("keeps requiring a grant on pages outside the category", async () => {
    for (const id of [GRANTED_PAGE_ID, `${GRANTED_PAGE_ID}.feed`]) {
      expect(await HasPermission(NO_PERMISSIONS, id), id).to.equal(false);
    }
  });

  it("opens the settings root to every member", () => {
    const { pageInfo } = GetMetadata(settingsCategory, PageMetadata);
    expect(pageInfo?.memberAccess).to.equal(true);
  });

  it("keeps requiring a grant on a page declared under the settings root", async () => {
    for (const id of [SETTINGS_PAGE_ID, `${SETTINGS_PAGE_ID}.feed`]) {
      expect(await HasPermission(NO_PERMISSIONS, id), id).to.equal(false);
    }
  });

  it("does not pass the flag from a page to the pages filed under it", async () => {
    expect(await HasPermission(NO_PERMISSIONS, NESTED_PAGE_ID)).to.equal(false);
  });

  it("leaves the member-held permissions out of the role editor", () => {
    const ids = [
      ...collectGrantablePermissionIds(permissionsImpl.GetPermissions()),
    ];
    expect(ids).to.not.include.members([PAGE_ID, COMPONENT_ID, ACTION_ID]);
    expect(ids).to.include(GRANTED_PAGE_ID);
  });
});
