import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";
import { componentsPanel, databasePanel, filesPanel } from "../panels";

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
        label: "Files",
        icon: "i-ph-book-open",
        slot: "persistent1",
      },
      {
        label: "Components",
        icon: "i-ph-code",
        slot: "persistent2",
      },
      {
        label: "Database",
        icon: "i-ph-lightning",
        slot: "persistent3",
      },
    ],
    color: Color.primary,
    size: Size.medium,
  })
    .child("filesPanel", filesPanel(), { slot: "persistent1" })
    .child("componentsPanel", componentsPanel(), { slot: "persistent2" })
    .child("databasePanel", databasePanel(), { slot: "persistent3" });
}
