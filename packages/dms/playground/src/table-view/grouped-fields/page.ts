import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { contactDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewGrouped extends PageController(
  "table-view-grouped",
  {
    displayName: "Grouped Fields",
    icon: "i-ph-squares-four",
    category: tableViewCategory,
    order: 50,
    description:
      "Form fields grouped into titled sections inside the add / edit form",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(contactDataAPI, {
    caption: "Contacts - Grouped Fields",
    labelKey: "firstName",
    rowActions: {
      add: true,
      delete: true,
      edit: true,
      details: true,
    },
  });
}
