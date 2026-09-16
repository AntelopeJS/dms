import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTabsBasic extends PageController("tabs-basic", {
  displayName: "Basic Tabs",
  icon: "i-ph-squares-four",
  category: pageCategory,
  order: 0,
  description: "Basic tabs test with Tree components",
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
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "files" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "components" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Explore database structure",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "database" },
    );

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
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "Browse project files - Press Shift+F to switch here",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "files" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "View component hierarchy - Press Shift+C to switch here",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "components" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description:
          "Explore database structure - Press Shift+D to switch here",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "database" },
    );
}
