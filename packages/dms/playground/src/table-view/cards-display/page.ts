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
import { demoFormPages } from "../form-texts";

const TASK_CARDS_DISPLAY_ID = "playground:task-cards";

@RegisterDataController()
class cardsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/cards-display", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewCardsDisplay extends PageController(
  "table-view-cards-display",
  {
    displayName: "Cards (Custom Display)",
    icon: "i-ph-cards",
    category: tableViewCategory,
    order: 110,
    description:
      "Project-contributed card display, sharing the table view's data, filters, search and pagination",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(cardsTaskDataAPI, {
    caption: "Tasks - Cards (Custom Display)",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
    },
    // The display *type* (label, icon, component) is registered by
    // playground/frontend-vue/app/plugins/table-view-cards-display.ts. Here we
    // opt this table view into it and provide the SSR-renderable component.
    displays: [
      {
        id: TASK_CARDS_DISPLAY_ID,
        component: CustomComponent("TaskCardsDisplay"),
      },
    ],
    defaultDisplay: TASK_CARDS_DISPLAY_ID,
  });
}
