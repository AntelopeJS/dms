import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { GetPermission } from "@antelopejs/interface-dms/permissions";
import { resolvePagePermissionId } from "../../../../utils";

const UNBOUND_PAGE_ID = "pap-unbound";
const UNBOUND_FULL_ID = `pages.${UNBOUND_PAGE_ID}`;
const BOUND_PAGE_ID = "pap-bound";
const BOUND_FULL_ID = `pages.${BOUND_PAGE_ID}`;
const HOST_PAGE_ID = "pap-host";
const COMPONENT_KEY = "panel";
const EDIT_PERMISSION = `pages.${HOST_PAGE_ID}.${COMPONENT_KEY}.edit`;

const hostPanel = new ComponentBuilder<{ tag: string }>("pap-host-panel")
  .options({ tag: "host" })
  .meta({ name: "Host" })
  .action("edit", { title: "Edit", icon: "i-ph-pencil" });

const unplacedPanel = new ComponentBuilder<{ tag: string }>("pap-unplaced")
  .options({ tag: "unplaced" })
  .meta({ name: "Unplaced" })
  .action("edit", { title: "Edit" });

class HostPage extends PageController(HOST_PAGE_ID, {
  displayName: "Host",
  category: pagesCategory,
}) {
  static panel = hostPanel;
}

class BoundActionPage extends PageController(BOUND_PAGE_ID, {
  displayName: "Bound",
  category: pagesCategory,
  permission: hostPanel.getAction("edit"),
}) {}

class UnboundActionPage extends PageController(UNBOUND_PAGE_ID, {
  displayName: "Unbound",
  category: pagesCategory,
  permission: unplacedPanel.getAction("edit"),
}) {}

async function registerPage(
  page: typeof HostPage | typeof BoundActionPage | typeof UnboundActionPage,
  place?: (meta: PageMetadata) => void,
): Promise<void> {
  const meta = GetMetadata(page, PageMetadata);
  place?.(meta);
  await meta.Register();
}

function unregisterPage(
  page: typeof HostPage | typeof BoundActionPage | typeof UnboundActionPage,
): void {
  const { pageInfo } = GetMetadata(page, PageMetadata);
  if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
}

describe("[unit] interfaces/dms/page — a page whose permission is an Action", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  afterEach(() => {
    unregisterPage(UnboundActionPage);
    unregisterPage(BoundActionPage);
    unregisterPage(HostPage);
  });

  it("keeps the page's own permission while the Action's component is not on a page (spreading the Action registered the Action's bare id and definition)", async () => {
    await registerPage(UnboundActionPage);

    const pageInfo = GetMetadata(UnboundActionPage, PageMetadata).pageInfo;
    expect(await GetPermission("edit")).to.equal(undefined);
    const own = await GetPermission(UNBOUND_FULL_ID);
    expect(own?.id).to.equal(UNBOUND_FULL_ID);
    expect(own?.title).to.equal("Unbound");
    expect(own).not.to.have.property("definition");
    expect(
      resolvePagePermissionId(pageInfo?.permission, UNBOUND_FULL_ID),
    ).to.equal(UNBOUND_FULL_ID);
  });

  it("is gated by the Action's permission once its component is on a page", async () => {
    await registerPage(HostPage, (meta) =>
      meta.SetComponent(COMPONENT_KEY, hostPanel),
    );
    await registerPage(BoundActionPage);

    expect(await GetPermission("edit")).to.equal(undefined);
    expect(await GetPermission(BOUND_FULL_ID)).to.equal(undefined);
    expect((await GetPermission(EDIT_PERMISSION))?.title).to.equal("Edit");
  });
});
