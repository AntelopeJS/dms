import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { TASK_STATUSES } from "../status";

const statusTabs = TASK_STATUSES.map((status) => ({
  id: status.value,
  label: status.label,
  icon: status.icon,
  iconColor: status.iconColor,
  textColor: status.textColor,
  filters: [
    { accessorKey: "status", value: status.value, mode: "is" as const },
  ],
}));

@RegisterPage()
export class PageTableViewTabs extends PageController(
  "table-view-tabs",
  {
    displayName: "Tabs",
    icon: "i-ph-tabs",
    category: tableViewCategory,
    order: 40,
    description:
      "TableView with backend-defined tabs filtering rows by status or priority",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Tabs",
    labelKey: "name",
    rowActions: {
      add: true,
      copyLink: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
    },
    defaultFilters: [
      { accessorKey: "email", mode: "contains" },
      { accessorKey: "due_date", mode: "is" },
      { accessorKey: "price", mode: "greater_than_or_equal_to" },
    ],
    tabs: [
      ...statusTabs,
      {
        id: "high_priority",
        label: "High priority",
        icon: "i-ph-fire",
        iconColor: "error",
        textColor: "error",
        filters: [{ accessorKey: "priority", value: "high", mode: "is" }],
      },
    ],
  });
}
