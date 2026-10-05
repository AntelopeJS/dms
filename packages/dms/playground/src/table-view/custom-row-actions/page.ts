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
class customRowActionsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/custom-row-actions", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewCustomRowActions extends PageController(
  "table-view-custom-row-actions",
  {
    displayName: "Custom Row Actions",
    icon: "i-ph-lightning",
    category: tableViewCategory,
    order: 60,
    description: "TableView with custom row actions and conditional rules",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(customRowActionsTaskDataAPI, {
    caption: "Tasks - Custom Row Actions",
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    defaultSort: { field: "due_date", desc: true },
    rowActions: {
      add: true,
      copyLink: true,
      delete: true,
      details: true,
      duplicate: true,
      edit: true,
      hasSelection: true,
      custom: [
        {
          label: "Archive",
          icon: "i-ph-archive",
          target: {
            type: "page",
            url: "/table-view/table-view-custom-row-actions",
          },
          rule: { field: "status", notEquals: "cancelled" },
        },
        {
          label: "Mark Complete",
          icon: "i-ph-check-circle",
          target: {
            type: "page",
            url: "/table-view/table-view-custom-row-actions",
          },
          rule: {
            and: [
              { field: "status", notEquals: "completed" },
              { field: "done", equals: false },
            ],
          },
        },
      ],
    },
  });
}
