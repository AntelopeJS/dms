import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  DefaultLayout,
  EmptyLayout,
  FormPageLayout,
  SettingsLayout,
} from "@antelopejs/interface-dms/base/layouts";
import {
  Category,
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterModule,
  settingsCategory,
} from "@antelopejs/interface-dms/page";
import type { ControllerClass } from "@antelopejs/interface-api";

const MODULE_ID = "cdl-module";

const layoutOf = (page: ControllerClass): string | undefined =>
  GetMetadata(page, PageMetadata).layout?.componentName;

describe("[unit] interfaces/dms/page — category default layout", () => {
  const settingsSection = Category("cdl-settings", {
    displayName: "Settings section",
    category: settingsCategory,
  });

  it("gives the settings pages the settings layout", () => {
    expect(layoutOf(settingsCategory)).to.equal(SettingsLayout().componentName);
    const page = PageController("cdl-settings-page", {
      displayName: "Settings page",
      category: settingsSection,
    });
    expect(layoutOf(page)).to.equal("dms-settings-layout");
  });

  it("passes the layout down through a page used as a category", () => {
    const parent = PageController("cdl-parent", {
      displayName: "Parent",
      category: settingsSection,
    });
    const nested = PageController("cdl-nested", {
      displayName: "Nested",
      category: parent,
    });
    expect(layoutOf(nested)).to.equal("dms-settings-layout");
  });

  it("keeps the layout a page declares itself", () => {
    const page = PageController(
      "cdl-own-layout",
      { displayName: "Own layout", category: settingsSection },
      EmptyLayout(),
    );
    expect(layoutOf(page)).to.equal("dms-empty-layout");
  });

  it("gives a module category's layout to its pages and sub-categories", () => {
    RegisterModule({
      id: MODULE_ID,
      title: "Layout module",
      description: "Module used by the layout tests",
      icon: "i-ph-cube",
    });
    const moduleSection = Category("cdl-section", {
      displayName: "Module section",
      module: MODULE_ID,
      layout: FormPageLayout(),
    });
    const subSection = Category("cdl-sub", {
      displayName: "Sub-section",
      category: moduleSection,
    });
    const page = PageController("cdl-module-page", {
      displayName: "Module page",
      module: MODULE_ID,
      category: subSection,
    });
    expect(GetMetadata(page, PageMetadata).layout?.options).to.deep.equal(
      FormPageLayout().options,
    );
  });

  it("lets the nearest category that declares a layout win", () => {
    const outer = Category("cdl-outer", {
      displayName: "Outer",
      category: pagesCategory,
      layout: FormPageLayout(),
    });
    const inner = Category("cdl-inner", {
      displayName: "Inner",
      category: outer,
      layout: EmptyLayout(),
    });
    const page = PageController("cdl-inner-page", {
      displayName: "Inner page",
      category: inner,
    });
    expect(layoutOf(page)).to.equal("dms-empty-layout");
  });

  it("falls back to the default layout when no category declares one", () => {
    const page = PageController("cdl-plain", {
      displayName: "Plain",
      category: pagesCategory,
    });
    expect(GetMetadata(page, PageMetadata).layout).to.deep.equal(
      DefaultLayout(),
    );
  });
});
