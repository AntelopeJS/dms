import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { jobRunDataAPI } from "./data-api";

const READ_ONLY = { add: false, duplicate: false, edit: false, delete: false };

@RegisterPage()
export class PageTableViewViews extends PageController(
  "table-view-views",
  {
    displayName: "Views, grouped & cells",
    icon: "i-ph-bookmarks-simple",
    category: tableViewCategory,
    order: 36,
    description:
      'TableView views: a strip of module views (counted, tokens {{user.id}} and {{now-7d}} resolved by the server), users\' own saved views, a "Timeline" view opening the grouped display by day, and the metric cell displays (status pill, progress, sparkline, duration, bytes, mono). The second table offers its views from a menu, grouped by status. Open a view from the URL: ?runs.view=failing',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static runs = TableView(jobRunDataAPI, {
    caption: "Job runs",
    labelKey: "name",
    formContainer: {
      type: "drawer",
      pages: {
        new: { displayName: "New run" },
        edit: { displayName: "Edit run" },
        details: { displayName: "Run details" },
      },
    },
    defaultSort: { field: "startedAt", desc: true },
    grouped: {
      groupByField: "startedAt",
      by: "day",
      collapsible: true,
      count: true,
    },
    views: {
      layout: "strip",
      defaultView: "all",
      userViews: true,
      items: [
        { id: "all", label: "All runs", icon: "i-ph-squares-four" },
        {
          id: "failing",
          label: "Failing",
          icon: "i-ph-warning-circle",
          tone: "error",
          count: true,
          filters: [{ accessorKey: "status", mode: "is", value: "failing" }],
        },
        {
          id: "this-week",
          label: "Started in the last 7 days",
          icon: "i-ph-calendar-blank",
          count: true,
          filters: [
            {
              accessorKey: "startedAt",
              mode: "greater_than",
              value: "{{now-7d}}",
            },
          ],
          sort: [{ field: "startedAt", desc: true }],
        },
        {
          id: "mine",
          label: "Mine",
          icon: "i-ph-user",
          count: true,
          filters: [
            { accessorKey: "ownerId", mode: "is", value: "{{user.id}}" },
          ],
        },
        {
          id: "timeline",
          label: "Timeline",
          icon: "i-ph-rows-plus-bottom",
          display: "grouped",
          columns: { hidden: ["runId", "outputBytes"] },
          density: "compact",
        },
      ],
    },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      hasSelection: true,
      custom: [
        {
          label: "Assign to me",
          icon: "i-ph-user-plus",
          target: {
            type: "api",
            url: "/api/playground/job-runs/assign-to-me?id={_id}",
            successMessage: "Assigned to you",
          },
        },
      ],
    },
  });

  static byStatus = TableView(jobRunDataAPI, {
    caption: "Runs by status",
    defaultSort: { field: "status" },
    defaultDisplay: "grouped",
    grouped: { groupByField: "status", collapsible: true, count: true },
    views: {
      layout: "menu",
      items: [
        { id: "grouped", label: "By status", display: "grouped" },
        {
          id: "slow",
          label: "Slowest first",
          sort: [{ field: "durationMs", desc: true }],
          display: "table",
        },
      ],
    },
    rowActions: READ_ONLY,
  });
}
