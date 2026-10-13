import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base/banner";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  TableView,
  tableViewLink,
} from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI, userDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";
import { demoGuide } from "../guide";
import { TASK_STATUSES } from "../status";
import { PageTableViewUsers } from "../users/page";
import { PageTableViewViews } from "../views/page";

const PAGE_PATH = "/table-view/table-view-tabs";
/** A permission no role grants: only an owner is served the tab. */
const NEVER_GRANTED = "playground.never-granted";
const PENDING = "pending";

const statusTabs = TASK_STATUSES.map((status) => ({
  id: status.value,
  label: status.label,
  icon: status.icon,
  iconColor: status.iconColor,
  textColor: status.textColor,
  filter: { accessorKey: "status", value: status.value, mode: "is" },
  ...(status.value === PENDING && { navBadge: { tone: "warning" as const } }),
}));

@RegisterDataController()
class tabsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/tabs", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewTabs extends PageController(
  "table-view-tabs",
  {
    displayName: "Filter tabs",
    icon: "i-ph-tabs",
    category: tableViewCategory,
    order: 40,
    description:
      "Filter tabs, link tabs and views in tabs above one table, the open tab kept in the URL. Click a tab and reload: it stays; follow the banner links to switch it.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static links = Banner({
    title: "Open a tab or a view from a link",
    description:
      "The tab you click is written to ?tab=; these links switch it in place. tableViewLink() builds the link to another page's table view.",
    icon: "i-ph-link",
    actions: [
      { label: "High priority", to: `${PAGE_PATH}?tab=high_priority` },
      { label: "Completed", to: `${PAGE_PATH}?tab=completed` },
      {
        label: "Failing runs (Views page)",
        to: tableViewLink(PageTableViewViews, "runs", { view: "failing" }),
      },
      {
        label: "Pending tasks only (route param)",
        to: "/table-view/table-view-tasks-by-status/pending",
        variant: "ghost",
      },
    ],
  });

  static guide = demoGuide([
    {
      label: "Tabs",
      text: '"All tasks" replaces the implicit all tab (id "all"); each status tab filters one column and counts its rows; "High priority" is gated by the "list" permission; "Docs" needs a permission no role grants (permissionId): only an owner sees it.',
    },
    {
      label: "Sidebar badge",
      text: 'navBadge { tone: "warning" } on Pending publishes its count on "Filter tabs" in the menu.',
    },
    {
      label: "Users (link tab)",
      text: "to: PageTableViewUsers opens that page; countFrom: userDataAPI counts its rows; navBadge: true badges the Users entry.",
    },
    {
      label: "Views as tabs",
      text: 'views.layout "tabs": "Overdue" (dot, count, {{now}} token), "A → Z" (sort, search, columns visible / order) and "For export" (permission "export", compact density) coexist with the tabs.',
    },
    {
      label: "Default filters",
      text: "defaultFilters open the filters row with email, due date and price chips waiting for a value; the price one already holds 500.",
    },
  ]);

  static table = TableView(tabsTaskDataAPI, {
    caption: "Tasks - Tabs",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      copyLink: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
    },
    defaultFilters: [
      { accessorKey: "email", mode: "contains" },
      { accessorKey: "due_date", mode: "is" },
      {
        accessorKey: "price",
        mode: "greater_than_or_equal_to",
        value: "500",
      },
    ],
    tabs: [
      { id: "all", label: "All tasks", icon: "i-ph-list-bullets" },
      ...statusTabs,
      {
        id: "high_priority",
        label: "High priority",
        icon: "i-ph-fire",
        iconColor: "error",
        textColor: "error",
        permission: "list",
        filter: { accessorKey: "priority", value: "high", mode: "is" },
      },
      {
        id: "users",
        label: "Users",
        icon: "i-ph-users",
        to: PageTableViewUsers,
        countFrom: userDataAPI,
        navBadge: true,
      },
      {
        id: "docs",
        label: "Docs",
        icon: "i-ph-book-open",
        to: "/examples",
        permissionId: NEVER_GRANTED,
      },
    ],
    views: {
      layout: "tabs",
      items: [
        {
          id: "overdue",
          label: "Overdue",
          icon: "i-ph-alarm",
          dot: "error",
          count: true,
          filters: [
            { accessorKey: "due_date", mode: "less_than", value: "{{now}}" },
          ],
        },
        {
          id: "by-name",
          label: "A → Z",
          icon: "i-ph-sort-ascending",
          search: "task",
          sort: [{ field: "due_date" }],
          columns: {
            visible: ["price"],
            order: ["name", "price", "status"],
          },
        },
        {
          id: "exports",
          label: "For export",
          icon: "i-ph-export",
          permission: "export",
          density: "compact",
        },
      ],
    },
  });
}
