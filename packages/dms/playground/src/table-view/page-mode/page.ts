import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewPage extends PageController(
  "table-view-page",
  {
    displayName: "Page Mode (Auto URLs)",
    icon: "i-ph-browser",
    category: tableViewCategory,
    order: 30,
    description: "TableView with page mode - auto-generated URLs",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
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
    formContainer: { type: "page" },
  });
}
