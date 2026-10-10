import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base/banner";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";

const PAGE_PATH = "/table-view/table-view-query-filters";

@RegisterPage()
export class PageTableViewQueryFilters extends PageController(
  "table-view-query-filters",
  {
    displayName: "URL query filters",
    icon: "i-ph-link",
    category: tableViewCategory,
    order: 37,
    description:
      'queryParamFilters: the banner links set ?status= or ?email=, a filter the table applies without showing it. Go to page 3, then pick another status: the table lists from page 1. "Nobody\'s tasks" matches no row: the table says no task matches, not that there are none yet',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static links = Banner({
    title: "Filter the tasks from the page URL",
    description:
      "Each link changes a hidden filter of the table below (?status= or ?email=).",
    icon: "i-ph-funnel",
    actions: [
      { label: "Pending", to: `${PAGE_PATH}?status=pending` },
      { label: "Completed", to: `${PAGE_PATH}?status=completed` },
      { label: "Nobody's tasks", to: `${PAGE_PATH}?email=nobody@example.com` },
      { label: "All tasks", to: PAGE_PATH, variant: "ghost" },
    ],
  });

  static tasks = TableView(taskDataAPI, {
    caption: "Tasks · queryParamFilters on status and email",
    labelKey: "name",
    queryParamFilters: {
      status: { field: "status" },
      email: { field: "email" },
    },
    rowActions: { add: false, duplicate: false, edit: false, delete: false },
  });
}
