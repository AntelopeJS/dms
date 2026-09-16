import type { ControllerClass } from "@antelopejs/interface-api";
import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import { PageTableViewArchive } from "./archive-mode/page";
import { tableViewCategory } from "./category";
import { PageTableViewConditionalDelete } from "./conditional-delete/page";
import { PageTableViewCustomRowActions } from "./custom-row-actions/page";
import { PageTableViewDrawer } from "./drawer-mode/page";
import { PageTableViewGrouped } from "./grouped-fields/page";
import { PageTableViewModal } from "./modal-mode/page";
import { PageTableViewPage } from "./page-mode/page";

const tableViewQuickActionCategory = QuickActionCategory(
  tableViewCategory.fullId,
  {
    displayName: tableViewCategory.displayName,
    icon: tableViewCategory.icon,
    order: tableViewCategory.order,
  },
);

interface TablePageSpec {
  id: string;
  displayName: string;
  icon: string;
  order: number;
  page: ControllerClass;
}

// Each entry opens the creation form of its page's table. Nothing declares a
// permission: reaching the page and holding its table's `add` permission is
// what the server checks, both derived from the page itself.
const tablePages: TablePageSpec[] = [
  {
    id: "table-view-drawer",
    displayName: "New Task (Drawer)",
    icon: "i-ph-table",
    order: 0,
    page: PageTableViewDrawer,
  },
  {
    id: "table-view-page",
    displayName: "New Task (Page)",
    icon: "i-ph-table",
    order: 1,
    page: PageTableViewPage,
  },
  {
    id: "table-view-modal",
    displayName: "New Task (Modal)",
    icon: "i-ph-table",
    order: 2,
    page: PageTableViewModal,
  },
  {
    id: "table-view-custom-row-actions",
    displayName: "New Task (Custom Actions)",
    icon: "i-ph-lightning",
    order: 4,
    page: PageTableViewCustomRowActions,
  },
  {
    id: "table-view-grouped",
    displayName: "New Contact (Grouped)",
    icon: "i-ph-squares-four",
    order: 5,
    page: PageTableViewGrouped,
  },
  {
    id: "table-view-archive",
    displayName: "New Task (Archive)",
    icon: "i-ph-archive",
    order: 10,
    page: PageTableViewArchive,
  },
  {
    id: "table-view-conditional-delete",
    displayName: "New Task (Conditional Delete)",
    icon: "i-ph-shield-warning",
    order: 11,
    page: PageTableViewConditionalDelete,
  },
];

for (const spec of tablePages) {
  QuickAction(`${spec.id}-add`, {
    category: tableViewQuickActionCategory,
    displayName: spec.displayName,
    icon: spec.icon,
    order: spec.order,
    target: { type: "openForm", page: spec.page },
  });
}
