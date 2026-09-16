import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewArchive extends PageController(
  "table-view-archive",
  {
    displayName: "Archive Mode",
    icon: "i-ph-archive",
    category: tableViewCategory,
    order: 80,
    description: "TableView with archive mode enabled",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Archive Mode",
    labelKey: "name",
    archiveMode: true,
    rowActions: {
      add: true,
      edit: true,
      details: true,
      duplicate: true,
      hasSelection: true,
      archive: true,
      restore: true,
    },
  });
}
