import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewModal extends PageController(
  "table-view-modal",
  {
    displayName: "Modal Mode",
    icon: "i-ph-app-window",
    category: tableViewCategory,
    order: 10,
    description: "TableView with modal mode - forms open in centered modals",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Modal Mode",
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
    formContainer: { type: "modal", size: "xl" },
  });
}
