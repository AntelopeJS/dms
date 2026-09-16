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

const playgroundActions = QuickActionCategory("playground", {
  displayName: "Playground",
  icon: "i-ph-lightning",
  order: 10,
});

// Routes to the page. Access follows it: hide the page behind a permission and
// this entry goes with it, with nothing to declare here.
QuickAction("open-tabs", {
  category: playgroundActions,
  displayName: "Open the tabs table",
  icon: "i-ph-tabs",
  order: 10,
  target: { type: "navigate", page: PageTableViewTabs },
});

// Routes to the page, then opens the creation form of the table view named
// here — the page mounts only one, but naming it survives a rename.
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

// The page mounts two table views, so this one names the table it means.
// Suspend the tenant with POST /playground/gate-demo/toggle: the action stays
// listed, because its page opts out of the tenant access gate.
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

// Dispatched where the user stands; the page only decides who may run it.
QuickAction("ping", {
  category: playgroundActions,
  displayName: "Dispatch a demo event",
  icon: "i-ph-broadcast",
  order: 40,
  target: {
    type: "event",
    page: PageTableViewTabs,
    name: "playground:quick-action-ping",
    payload: { source: "quick-action" },
  },
});
