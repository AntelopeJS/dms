import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base/banner";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoGuide } from "../guide";

const PAGE_PATH = "/table-view/table-view-query-filters";

// A controller of its own: `realtime: false` is read off the controller's
// table view, so it must not turn the shared tasks' realtime off.
@RegisterDataController()
class queryFiltersTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/query-filters", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewQueryFilters extends PageController(
  "table-view-query-filters",
  {
    displayName: "URL query filters",
    icon: "i-ph-link",
    category: tableViewCategory,
    order: 37,
    description:
      "queryParamFilters: the page URL filters the table, hidden or as a chip the user can remove. Follow the banner links, then drop a chip.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static links = Banner({
    title: "Filter the tasks from the page URL",
    description:
      "Each link sets a query parameter the table below turns into a filter.",
    icon: "i-ph-funnel",
    actions: [
      { label: "Pending", to: `${PAGE_PATH}?status=pending` },
      { label: "Completed", to: `${PAGE_PATH}?status=completed` },
      { label: "Price ≥ 500", to: `${PAGE_PATH}?minPrice=500` },
      { label: "Nobody's tasks", to: `${PAGE_PATH}?email=nobody@example.com` },
      { label: "All tasks", to: PAGE_PATH, variant: "ghost" },
    ],
  });

  static guide = demoGuide([
    {
      label: "?status=",
      text: "A hidden filter: no chip, the user cannot clear it. Go to page 3, then pick another status: the table lists from page 1.",
    },
    {
      label: "?email=, ?minPrice=",
      text: 'visible: true shows the filter as a chip named by label ("Owner email", "Min price"); its × drops the parameter from the URL. minPrice compares with mode "greater_than_or_equal_to".',
    },
    {
      label: "Nobody's tasks",
      text: "No row matches: the filtered empty state is a component (TasksFilteredEmpty) reading useTableViewEmptyState() for its Clear search / Clear filters / Reload buttons.",
    },
    {
      label: "No realtime",
      text: "realtime: false: this read-only table neither broadcasts nor shows presence; edits made on another page reach it on reload.",
    },
  ]);

  static tasks = TableView(queryFiltersTaskDataAPI, {
    caption: "Tasks · queryParamFilters",
    labelKey: "name",
    realtime: false,
    queryParamFilters: {
      status: { field: "status" },
      email: { field: "email", visible: true, label: "Owner email" },
      minPrice: {
        field: "price",
        mode: "greater_than_or_equal_to",
        visible: true,
        label: "Min price",
      },
    },
    emptyStates: {
      filtered: {
        title: "No task matches",
        component: CustomComponent("TasksFilteredEmpty"),
      },
    },
    rowActions: { add: false, duplicate: false, edit: false, delete: false },
  });
}
