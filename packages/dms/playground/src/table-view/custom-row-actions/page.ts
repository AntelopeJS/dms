import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

@RegisterPage()
export class PageTableViewCustomRowActions extends PageController(
  "table-view-custom-row-actions",
  {
    displayName: "Custom Row Actions",
    icon: "i-ph-lightning",
    category: tableViewCategory,
    order: 60,
    description: "TableView with custom row actions and conditional rules",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(taskDataAPI, {
    caption: "Tasks - Custom Row Actions",
    labelKey: "name",
    defaultSort: { field: "due_date", desc: true },
    rowActions: {
      add: true,
      copyLink: true,
      delete: true,
      details: true,
      duplicate: true,
      edit: true,
      hasSelection: true,
      custom: [
        {
          label: "Archive",
          icon: "i-ph-archive",
          target: {
            type: "page",
            url: "/table-view/table-view-custom-row-actions",
          },
          rule: { field: "status", notEquals: "cancelled" },
        },
        {
          label: "Mark Complete",
          icon: "i-ph-check-circle",
          target: {
            type: "page",
            url: "/table-view/table-view-custom-row-actions",
          },
          rule: {
            and: [
              { field: "status", notEquals: "completed" },
              { field: "done", equals: false },
            ],
          },
        },
      ],
    },
  });
}
