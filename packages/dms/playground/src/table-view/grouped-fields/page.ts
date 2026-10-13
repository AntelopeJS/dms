import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { contactDataAPI } from "./data-api";
import { demoFormPages } from "../form-texts";

@RegisterPage()
export class PageTableViewGrouped extends PageController(
  "table-view-grouped",
  {
    displayName: "Form field groups",
    icon: "i-ph-squares-four",
    category: tableViewCategory,
    order: 50,
    description:
      "@ColumnGroup sorts the fields of the add, edit and details forms into titled sections. Open a contact or add one.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(contactDataAPI, {
    caption: "Contacts - Form field groups",
    labelKey: "firstName",
    formContainer: { type: "page", pages: demoFormPages("contact") },
    rowActions: {
      add: true,
      delete: true,
      edit: true,
      details: true,
    },
  });
}
