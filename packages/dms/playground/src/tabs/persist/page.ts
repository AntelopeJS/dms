import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { Tab, TabVariant } from "@antelopejs/interface-dms/base/tab";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";
import { componentsPanel, databasePanel, filesPanel } from "../panels";

@RegisterPage()
export class PageTabsPersist extends PageController("tabs-persist", {
  displayName: "Persistent Tabs",
  icon: "i-ph-link",
  category: pageCategory,
  order: 20,
  description:
    "Tabs whose selection lives in the URL, for shareable links: under ?activeTab= (stateKey), and under the default ?tab= key for the second set. Pick a tab and reload: it stays open.",
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

  static tabsDefaultKey = Tab({
    persistState: true,
    variant: TabVariant.pill,
    items: [
      { label: "Overview", icon: "i-ph-house", slot: "overview" },
      { label: "History", icon: "i-ph-clock", slot: "history" },
    ],
  })
    .child(
      "overviewPanel",
      Placeholder({ label: "?tab=overview", height: "80px" }),
      { slot: "overview" },
    )
    .child(
      "historyPanel",
      Placeholder({ label: "?tab=history", height: "80px" }),
      { slot: "history" },
    );
}
