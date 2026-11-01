import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  Category,
  PageController,
  PageMetadata,
  RegisterModule,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  GetPermission,
  HasPermission,
  IsModuleScopedPermission,
  MarkModuleScopedPermission,
  UnmarkModuleScopedPermission,
} from "@antelopejs/interface-dms/permissions";

const PAGE_ID = "cap-page";
const COMPONENT_KEY = "panel";
const EDIT_PERMISSION = `pages.${PAGE_ID}.${COMPONENT_KEY}.edit`;
const MODULE_ID = "cap-module";
const MODULES_ROOT = "modules";
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

const latePanel = new ComponentBuilder<{ tag: string }>("cap-late")
  .options({ tag: "late" })
  .meta({ name: "Late" })
  .action("edit", { title: "Edit" });

const moduleAdminPanel = new ComponentBuilder<{ tag: string }>("cap-module")
  .options({ tag: "module" })
  .meta({ name: "Module panel" })
  .action("edit", { title: "Edit" });

class ActionHostPage extends PageController(PAGE_ID, {
  displayName: "Action host",
  category: pagesCategory,
}) {
  static panel = panel;
}

class LateHostPage extends PageController("cap-late-host", {
  displayName: "Late host",
  category: pagesCategory,
}) {
  static panel = latePanel;
}

class ModuleHostPage extends PageController("cap-module-host", {
  displayName: "Module host",
  category: pagesCategory,
}) {
  static panel = moduleAdminPanel;
}

async function placeOnPage(
  page: typeof ActionHostPage | typeof LateHostPage | typeof ModuleHostPage,
): Promise<void> {
  const meta = GetMetadata(page, PageMetadata);
  meta.SetComponent(COMPONENT_KEY, page.panel);
  await meta.Register();
}

describe("[unit] interfaces/dms/page — a category whose permission is an Action", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    await placeOnPage(ActionHostPage);
  });

  after(() => {
    for (const page of [ActionHostPage, LateHostPage, ModuleHostPage]) {
      const { pageInfo } = GetMetadata(page, PageMetadata);
      if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
    }
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

  it("leaves its pages reachable without a category grant when it is declared before its Action's component is placed (registering a fallback category permission at declaration made the outcome depend on declaration order)", async () => {
    const category = Category("cap-late-category", {
      displayName: "Late",
      category: pagesCategory,
      permission: latePanel.getAction("edit"),
    });
    class ChildPage extends PageController("cap-late-child", {
      displayName: "Late child",
      category,
    }) {}
    await GetMetadata(ChildPage, PageMetadata).Register();
    await placeOnPage(LateHostPage);

    const childId = `${category.fullId}.cap-late-child`;
    expect(await GetPermission(category.fullId)).to.equal(undefined);
    expect(await GetPermission(childId)).to.not.equal(undefined);
    expect(await HasPermission(new Set(["pages", childId]), childId)).to.equal(
      true,
    );
    const { pageInfo } = GetMetadata(ChildPage, PageMetadata);
    if (pageInfo) pageInterfaceInternal.RegisterPage.unregister(pageInfo);
  });

  it("unmarks the module scope it marked, whether or not the Action was placed by then (unmarking the Action's id left the category's own mark behind)", async () => {
    const moduleRoot = RegisterModule({
      id: MODULE_ID,
      title: "Action module",
      description: "Module used by the category Action tests",
      icon: "i-ph-cube",
    });
    const category = Category("cap-module-category", {
      displayName: "Module category",
      module: MODULE_ID,
      permission: moduleAdminPanel.getAction("edit"),
    });
    await placeOnPage(ModuleHostPage);

    expect(IsModuleScopedPermission(category.fullId)).to.equal(true);
    pageInterfaceInternal.RegisterCategory.unregister(category);
    pageInterfaceInternal.RegisterCategory.unregister(moduleRoot);
    UnmarkModuleScopedPermission(MODULES_ROOT);
    try {
      expect(IsModuleScopedPermission(category.fullId)).to.equal(false);
    } finally {
      MarkModuleScopedPermission(MODULES_ROOT);
    }
  });
});
