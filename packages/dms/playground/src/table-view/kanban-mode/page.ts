import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task, TaskModel } from "../database";
import { demoFormTexts } from "../form-texts";

@RegisterDataController()
class kanbanTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/kanban-mode", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

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
    formTexts: demoFormTexts("task"),
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
      cardFields: ["email", "due_date", "price", "completion_percentage"],
    },
    defaultDisplay: "kanban",
  });
}
