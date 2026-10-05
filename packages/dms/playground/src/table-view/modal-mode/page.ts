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
class modalTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/modal-mode", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewModal extends PageController(
  "table-view-modal",
  {
    displayName: "Modal Mode",
    icon: "i-ph-app-window",
    category: tableViewCategory,
    order: 10,
    description:
      "Add, edit and details forms open in a centred modal over the task list",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(modalTaskDataAPI, {
    caption: "Tasks - Modal Mode",
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    rowActions: {
      add: true,
      copyLink: true,
      delete: true,
      details: true,
      duplicate: true,
      edit: true,
      hasSelection: true,
    },
    formContainer: { type: "modal", size: "xl" },
  });
}
