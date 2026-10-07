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
class conditionalDeleteTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/conditional-delete", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewConditionalDelete extends PageController(
  "table-view-conditional-delete",
  {
    displayName: "Conditional Delete",
    icon: "i-ph-shield-warning",
    category: tableViewCategory,
    order: 70,
    description: "TableView with conditional row deletion based on task status",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(conditionalDeleteTaskDataAPI, {
    caption:
      "Tasks - Delete/Edit allowed if task is neither high priority nor completed",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      copyLink: true,
      delete: {
        isEnabled: true,
        rule: {
          and: [
            { field: "status", notEquals: "completed" },
            { field: "priority", notEquals: "high" },
          ],
        },
      },
      details: {
        isEnabled: true,
        rule: {
          or: [
            { field: "status", equals: "completed" },
            { field: "priority", equals: "high" },
          ],
        },
      },
      duplicate: true,
      edit: {
        isEnabled: true,
        rule: {
          and: [
            { field: "status", notEquals: "completed" },
            { field: "priority", notEquals: "high" },
          ],
        },
      },
      hasSelection: true,
    },
  });
}
