import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";
import { componentsPanel, databasePanel, filesPanel } from "../panels";

@RegisterPage()
export class PageTabsBasic extends PageController("tabs-basic", {
  displayName: "Basic Tabs",
  icon: "i-ph-squares-four",
  category: pageCategory,
  order: 0,
  description: "The plainest tabs: each tab holds a key / value list",
}) {
  static tabs = Tab({
    items: [
      {
        label: "Files",
        icon: "i-ph-file",
        slot: "files",
      },
      {
        label: "Components",
        icon: "i-ph-cube",
        slot: "components",
      },
      {
        label: "Database",
        icon: "i-ph-database",
        slot: "database",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child("filesPanel", filesPanel(), { slot: "files" })
    .child("componentsPanel", componentsPanel(), { slot: "components" })
    .child("databasePanel", databasePanel(), { slot: "database" });

  static tabsWithShortcuts = Tab({
    items: [
      {
        label: "Files (Shift+F)",
        icon: "i-ph-file",
        shortcut: "f",
        slot: "files",
      },
      {
        label: "Components (Shift+C)",
        icon: "i-ph-cube",
        shortcut: "c",
        slot: "components",
      },
      {
        label: "Database (Shift+D)",
        icon: "i-ph-database",
        shortcut: "d",
        slot: "database",
      },
    ],
    color: Color.success,
    size: Size.medium,
  })
    .child("filesPanel", filesPanel(), { slot: "files" })
    .child("componentsPanel", componentsPanel(), { slot: "components" })
    .child("databasePanel", databasePanel(), { slot: "database" });
}
