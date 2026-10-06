import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";

@RegisterDataController()
class kanbanTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/kanban-mode", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewKanban extends PageController(
  "table-view-kanban",
  {
    displayName: "Kanban",
    icon: "i-ph-kanban",
    category: tableViewCategory,
    order: 90,
    description:
      "TableView with kanban display mode, grouped by status with drag & drop",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(kanbanTaskDataAPI, {
    caption: "Tasks - Kanban",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      copyLink: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
    },
    kanban: { groupByField: "status" },
    card: { fields: ["email", "due_date", "price", "completion_percentage"] },
    defaultDisplay: "kanban",
  });
}
