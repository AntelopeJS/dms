import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  Category,
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { GetPermission } from "@antelopejs/interface-dms/permissions";

const PAGE_ID = "cap-page";
const COMPONENT_KEY = "panel";
const EDIT_PERMISSION = `pages.${PAGE_ID}.${COMPONENT_KEY}.edit`;
const VIEW_PERMISSION = `pages.${PAGE_ID}.${COMPONENT_KEY}.view`;

const panel = new ComponentBuilder<{ tag: string }>("cap-panel")
  .options({ tag: "panel" })
  .meta({ name: "Panel" })
  .action("view", { title: "View" })
  .action("edit", {
    title: "Edit",
    icon: "i-ph-pencil",
    dependencies: ["view"],
  });

const unplacedPanel = new ComponentBuilder<{ tag: string }>("cap-unplaced")
  .options({ tag: "unplaced" })
  .meta({ name: "Unplaced" })
  .action("edit", { title: "Edit" });

class ActionHostPage extends PageController(PAGE_ID, {
  displayName: "Action host",
  category: pagesCategory,
}) {
  static panel = panel;
}

describe("[unit] interfaces/dms/page — a category whose permission is an Action", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const meta = GetMetadata(ActionHostPage, PageMetadata);
    meta.SetComponent(COMPONENT_KEY, panel);
    await meta.Register();
  });

  after(() => {
    const { pageInfo } = GetMetadata(ActionHostPage, PageMetadata);
    if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
  });

  it("is gated by the action's permission and never registers the Action's bare id (spreading the Action copied its own id and definition)", async () => {
    const category = Category("cap-bound", {
      displayName: "Bound",
      category: pagesCategory,
      permission: panel.getAction("edit"),
    });

    expect(await GetPermission("edit")).to.equal(undefined);
    expect(await GetPermission(category.fullId)).to.equal(undefined);
    const editPermission = await GetPermission(EDIT_PERMISSION);
    expect(editPermission?.id).to.equal(EDIT_PERMISSION);
    expect(editPermission?.title).to.equal("Edit");
    expect(editPermission?.dependencies).to.deep.equal([VIEW_PERMISSION]);
  });

  it("falls back to the category's own permission while the Action's component is not on a page", async () => {
    const category = Category("cap-unbound", {
      displayName: "Unbound",
      category: pagesCategory,
      permission: unplacedPanel.getAction("edit"),
    });

    expect(await GetPermission("edit")).to.equal(undefined);
    const own = await GetPermission(category.fullId);
    expect(own?.id).to.equal(category.fullId);
    expect(own?.title).to.equal("Unbound");
  });
});
