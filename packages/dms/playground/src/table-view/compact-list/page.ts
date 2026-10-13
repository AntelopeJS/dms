import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";
import { demoGuide } from "../guide";

const PAGE_SIZE = 15;

@RegisterDataController()
class compactListTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/compact-list", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewCompactList extends PageController(
  "table-view-compact-list",
  {
    displayName: "Compact list",
    icon: "i-ph-list-dashes",
    category: tableViewCategory,
    order: 33,
    description:
      "The list of a settings page: compact layout, quick filters, infinite scroll, pinned rows and a formatted footer. Pick a quick filter, sort a column, then scroll.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Layout",
      text: 'layout: "compact" draws an always-open search (searchPlaceholder), quick filters and the footer, no caption nor filters row; columns.hidden trims the grid for this page only.',
    },
    {
      label: "Quick filters",
      text: 'quickFilters on Status (label, icon), Priority (allLabel "Any priority") and Is Done (mode "is"): each button names its value ("Status: Pending") with a clear button.',
    },
    {
      label: "Pinned rows",
      text: 'pinnedRows { field: "priority", equals: "high" } lists high-priority tasks first whatever the sort; clear your sort and the table goes back to defaultSort (due date).',
    },
    {
      label: "Scroll",
      text: 'pagination: "infinite" appends the next 15 rows (pageSize: 15, which joins the page size picker) as the end comes into view.',
    },
    {
      label: "Footer",
      text: "footer.hint, a countLabel, and a summary formatted as a compact euro amount (summary.format).",
    },
    {
      label: "By week",
      text: 'grouped { groupByField: "due_date", by: "week" }: switch to the grouped display for one group per week.',
    },
  ]);

  static tasks = TableView(compactListTaskDataAPI, {
    layout: "compact",
    labelKey: "name",
    searchPlaceholder: "Search a task or an email",
    quickFilters: [
      { field: "status", label: "Status", icon: "i-ph-circle-half" },
      { field: "priority", allLabel: "Any priority" },
      { field: "done", label: "Done", mode: "is" },
    ],
    pageSize: PAGE_SIZE,
    pagination: "infinite",
    columns: {
      hidden: [
        "url",
        "phone",
        "address",
        "thumbnail",
        "photos",
        "completion_percentage",
        "assignees",
      ],
    },
    footer: {
      countLabel: "$demo.table_view.task_count",
      hint: "Scroll to load more",
      summary: [
        {
          label: "Budget",
          field: "price",
          op: "sum",
          format: { style: "currency", currency: "EUR", notation: "compact" },
        },
      ],
    },
    defaultSort: { field: "due_date" },
    pinnedRows: { field: "priority", equals: "high" },
    grouped: { groupByField: "due_date", by: "week", count: true },
    formContainer: { type: "drawer", pages: demoFormPages("task") },
    rowActions: { add: true, edit: true, delete: true, hasSelection: true },
  });
}
