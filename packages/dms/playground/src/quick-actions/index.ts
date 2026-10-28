import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import {
  nestedTasksTarget,
  PageExtensionTargetPage,
} from "../page-extension/target-page";
import { PageTableViewGateBypass } from "../table-view/gate-bypass/page";
import { PageTableViewTabs } from "../table-view/tabs/page";
import { DynamicNavigationProjectPage } from "../navigation/project-page";
import { PRESS_BUTTON_ID, QuickActionsPage } from "./page";

export * from "./api";
export * from "./page";

const playgroundActions = QuickActionCategory("playground", {
  displayName: "Playground",
  icon: "i-ph-lightning",
  order: 10,
});

QuickAction("open-tabs", {
  category: playgroundActions,
  displayName: "Open the tabs table",
  icon: "i-ph-tabs",
  order: 10,
  target: { type: "navigate", page: PageTableViewTabs },
});

QuickAction("open-invoicer", {
  category: playgroundActions,
  displayName: "Open project invoicer",
  icon: "i-ph-cube",
  order: 15,
  target: {
    type: "navigate",
    page: DynamicNavigationProjectPage,
    query: { project: "invoicer" },
  },
});

QuickAction("new-task", {
  category: playgroundActions,
  displayName: "New task",
  icon: "i-ph-plus",
  order: 20,
  target: {
    type: "openForm",
    page: PageTableViewTabs,
    component: PageTableViewTabs.table,
  },
});

QuickAction("new-invoice", {
  category: playgroundActions,
  displayName: "New invoice (survives the gate)",
  icon: "i-ph-receipt",
  order: 30,
  target: {
    type: "openForm",
    page: PageTableViewGateBypass,
    component: PageTableViewGateBypass.invoices,
  },
});

QuickAction("new-nested-task", {
  category: playgroundActions,
  displayName: "New nested task",
  icon: "i-ph-tree-structure",
  order: 35,
  target: {
    type: "openForm",
    page: PageExtensionTargetPage,
    component: nestedTasksTarget,
  },
});

QuickAction("press-button", {
  category: playgroundActions,
  displayName: "Press the quick actions table's button",
  icon: "i-ph-hand-pointing",
  order: 38,
  target: {
    type: "button",
    page: QuickActionsPage,
    button: PRESS_BUTTON_ID,
    component: QuickActionsPage.actions,
  },
});

QuickAction("ping", {
  category: playgroundActions,
  displayName: "Dispatch a demo event",
  icon: "i-ph-broadcast",
  order: 40,
  target: {
    type: "event",
    page: QuickActionsPage,
    name: "playground:quick-action-ping",
    payload: { source: "quick-action" },
  },
});
