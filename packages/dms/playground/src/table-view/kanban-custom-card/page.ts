import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewKanbanCustomCard extends PageController(
  "table-view-kanban-custom-card",
  {
    displayName: "Kanban (Custom Card)",
    icon: "i-ph-cards",
    category: tableViewCategory,
    order: 100,
    description:
      "Kanban display mode rendering each card with a custom component",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Kanban (Custom Card)",
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
    kanban: {
      groupByField: "status",
      cardComponent: CustomComponent("KanbanTaskCard"),
    },
    defaultDisplay: "kanban",
  });
}
