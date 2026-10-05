import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { userDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewUsers extends PageController(
  "table-view-users",
  {
    displayName: "Users",
    icon: "i-ph-users",
    category: tableViewCategory,
    order: 140,
    description: "Users TableView used as relation target by Tasks.assignees",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(userDataAPI, {
    caption: "Users",
    labelKey: "name",
    formContainer: {
      type: "page",
      pages: {
        new: {
          displayName: "$demo.forms.user.new_title",
          description: "$demo.forms.user.new_description",
        },
        edit: {
          displayName: "$demo.forms.user.edit_title",
          description: "$demo.forms.user.edit_description",
        },
        details: {
          displayName: "$demo.forms.user.view_title",
          description: "$demo.forms.user.view_description",
        },
      },
    },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      details: true,
      hasSelection: true,
    },
  });
}
