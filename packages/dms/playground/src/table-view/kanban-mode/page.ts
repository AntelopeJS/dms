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

const COLUMN_MAX_HEIGHT = "420px";

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
      "Kanban boards: grouped by status with drag & drop and a capped column height, then a read-only board grouped by a boolean. Drag a card to change its status.",
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
    kanban: { groupByField: "status", columnMaxHeight: COLUMN_MAX_HEIGHT },
    card: { fields: ["email", "due_date", "price", "completion_percentage"] },
    defaultDisplay: "kanban",
  });

  static byDone = TableView(taskDataAPI, {
    caption: "Done or not (read-only board)",
    labelKey: "name",
    kanban: { groupByField: "done", draggable: false },
    card: { fields: ["status", "due_date"] },
    defaultDisplay: "kanban",
    rowActions: { add: false, duplicate: false, edit: false, delete: false },
  });
}
