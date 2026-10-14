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
import { TASK_DEFAULT_SORT } from "../status";

@RegisterDataController()
class pageModeTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/page-mode", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewPage extends PageController(
  "table-view-page",
  {
    displayName: "Page Mode (Auto URLs)",
    icon: "i-ph-browser",
    category: tableViewCategory,
    order: 30,
    description:
      "Add, edit and details forms open as full pages at URLs the table builds (<page>/table/new, <page>/table/:id/edit). Open a task, then read the URL.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(pageModeTaskDataAPI, {
    defaultSort: TASK_DEFAULT_SORT,
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
  });
}
