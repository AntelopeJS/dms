import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task, TaskModel } from "../database";
import { demoFormTexts } from "../form-texts";

@RegisterDataController()
class kanbanCardTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/kanban-custom-card", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

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
  static table = TableView(kanbanCardTaskDataAPI, {
    caption: "Tasks - Kanban (Custom Card)",
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
    kanban: { groupByField: "status" },
    // One card for both card displays: the board and the card grid hand it
    // the same props.
    card: { component: CustomComponent("KanbanTaskCard") },
    displays: [{ id: "cards" }],
    defaultDisplay: "kanban",
  });
}
