import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTabsKeepAlive extends PageController("tabs-keep-alive", {
  displayName: "Keep Alive Tabs",
  icon: "i-ph-memory",
  category: pageCategory,
  order: 10,
  description: "Tabs that keep components mounted when switching",
}) {
  static tabsKeepAlive = Tab({
    unmountOnHide: false, // Components will NOT be unmounted when hidden (keep alive behavior)
    items: [
      {
        label: "Persistent Tree 1",
        icon: "i-ph-floppy-disk",
        slot: "persistent1",
      },
      {
        label: "Persistent Tree 2",
        icon: "i-ph-memory",
        slot: "persistent2",
      },
      {
        label: "Persistent Tree 3",
        icon: "i-ph-database",
        slot: "persistent3",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child(
      "filesTree",
      Tree({
        title: "File Explorer",
        description: "This tree stays mounted even when switching tabs",
        fetchUrl: "/api/tree/files",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "persistent1" },
    )
    .child(
      "componentsTree",
      Tree({
        title: "Component Tree",
        description: "State is preserved when switching tabs",
        fetchUrl: "/api/tree/components",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "persistent2" },
    )
    .child(
      "databaseTree",
      Tree({
        title: "Database Schema",
        description: "Remains in memory for faster switching",
        fetchUrl: "/api/tree/database",
        color: Color.primary,
        size: Size.medium,
        multiple: false,
        selectionBehavior: TreeSelectionBehavior.toggle,
        lazyLoad: true,
      }),
      { slot: "persistent3" },
    );
}
