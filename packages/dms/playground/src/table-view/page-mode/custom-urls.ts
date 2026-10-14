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

const TASK_PAGES = demoFormPages("task");

@RegisterDataController()
class pageCustomUrlsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/page-custom-urls", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewPageCustomUrls extends PageController(
  "table-view-page-custom-urls",
  {
    displayName: "Page Mode (custom URLs)",
    icon: "i-ph-link-simple",
    category: tableViewCategory,
    order: 31,
    description:
      "The same forms as full pages, at URLs the module names with formContainer.pages.*.urlSlug: <page>/create, <page>/:id and <page>/:id/modify. Open a task, then read the URL.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(pageCustomUrlsTaskDataAPI, {
    defaultSort: TASK_DEFAULT_SORT,
    caption: "Tasks - Page Mode (custom URLs)",
    labelKey: "name",
    rowActions: {
      add: true,
      delete: true,
      details: true,
      edit: true,
      hasSelection: true,
    },
    formContainer: {
      type: "page",
      pages: {
        new: { ...TASK_PAGES.new, urlSlug: "create" },
        edit: { ...TASK_PAGES.edit, urlSlug: ":id/modify" },
        details: { ...TASK_PAGES.details, urlSlug: ":id" },
      },
    },
  });
}
