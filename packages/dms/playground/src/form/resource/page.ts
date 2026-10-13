import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { QUERY_ROW_ID } from "@antelopejs/interface-dms/base/resource-form-schema";
import { ResourceForm } from "@antelopejs/interface-dms/base/table-view";
import { pageCategory } from "../category";
import { taskDataAPI } from "../../table-view/data-api";

const PAGE_PATH = "/form/form-resource";

/**
 * Forms over a table's rows (`ResourceForm`): the fields, routes and methods
 * come from the data controller and the mode. Creating a task opens this page
 * again on it (`redirectOnSuccess` with `{{response._id}}`), so the edit and
 * view forms below read it from `?id=` (`QUERY_ROW_ID`, the default `rowId`).
 */
@RegisterPage()
export class PageFormResource extends PageController(
  "form-resource",
  {
    displayName: "Table form",
    icon: "i-ph-table",
    category: pageCategory,
    order: 9.3,
    description:
      "ResourceForm in its three modes over the tasks table. Create a task: the page reopens on ?id= of it, where the edit and view forms load it.",
  },
  FormPageLayout(),
) {
  static help = Banner({
    title: "The edit and view forms read the task from ?id=",
    description:
      "Create one below, or open a task from the Drawer Mode table and copy its id into the URL.",
    size: "sm",
    actions: [{ label: "Tasks table", to: "/table-view/table-view-drawer" }],
  });

  static create = ResourceForm(taskDataAPI, {
    mode: "new",
    title: "New task",
    description: "Its file and image columns save through the table's routes.",
    redirectOnSuccess: `${PAGE_PATH}?id={{response._id}}`,
  });

  static edit = ResourceForm(taskDataAPI, {
    mode: "edit",
    title: "Edit task",
    rowId: QUERY_ROW_ID,
    labelKey: "name",
  });

  static view = ResourceForm(taskDataAPI, {
    mode: "view",
    title: "Task details",
  });
}
