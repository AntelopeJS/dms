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
    formTexts: demoFormTexts("task"),
    rowActions: {
      add: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
    },
    // The display *type* (label, icon, capabilities, component) is registered on
    // the client in playground/frontend-vue/app/plugins/table-view-cards-display.client.ts.
    // Here we opt this table view into it and provide the SSR-renderable component.
    displays: [{ id: "cards", component: CustomComponent("TaskCardsDisplay") }],
    defaultDisplay: "cards",
  });
}
