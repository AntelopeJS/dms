import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { demoFormPages } from "../form-texts";

@RegisterPage()
export class PageTableViewDrawer extends PageController(
  "table-view-drawer",
  {
    displayName: "Drawer Mode",
    icon: "i-ph-sidebar",
    category: tableViewCategory,
    order: 0,
    description:
      "Add, edit and details forms open in a side drawer next to the task list",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Drawer Mode",
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
    formContainer: { type: "drawer", pages: demoFormPages("task") },
  });
}
