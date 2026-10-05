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
import { demoFormPages } from "../form-texts";

@RegisterDataController()
class pageModeTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/page-mode", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewPage extends PageController(
  "table-view-page",
  {
    displayName: "Page Mode (Auto URLs)",
    icon: "i-ph-browser",
    category: tableViewCategory,
    order: 30,
    description:
      "Add, edit and details forms open as full pages with their own URLs",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(pageModeTaskDataAPI, {
    caption: "Tasks - Page Mode (Auto URLs)",
    labelKey: "name",
    rowActions: {
      add: true,
      copyLink: true,
      delete: true,
      details: true,
      duplicate: true,
      edit: true,
      hasSelection: true,
    },
    formContainer: { type: "page", pages: demoFormPages("task") },
    // Offers the built-in cards display next to the grid (display switch in
    // the toolbar).
    displays: [{ id: "cards" }],
  });
}
