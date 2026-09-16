import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTabsPersist extends PageController("tabs-persist", {
  displayName: "Persistent Tabs",
  icon: "i-ph-link",
  category: pageCategory,
  order: 20,
  description: "Tabs with URL persistence for shareable links",
}) {
  static tabsUrl = Tab({
    persistState: true,
    stateKey: "activeTab",
    items: [
      {
        label: "Persistent Tree 1",
        icon: "i-ph-book-open",
        slot: "persistent1",
      },
      {
        label: "Persistent Tree 2",
        icon: "i-ph-code",
        slot: "persistent2",
      },
      {
        label: "Persistent Tree 3",
        icon: "i-ph-lightning",
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
        description: "Browse project files",
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
        description: "View component hierarchy",
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
        description: "Explore database structure",
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
