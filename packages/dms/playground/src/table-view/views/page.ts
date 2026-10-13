import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { jobRunDataAPI } from "./data-api";

const READ_ONLY = { add: false, duplicate: false, edit: false, delete: false };

@RegisterPage()
export class PageTableViewViews extends PageController(
  "table-view-views",
  {
    displayName: "Views & grouped display",
    icon: "i-ph-bookmarks-simple",
    category: tableViewCategory,
    order: 36,
    description:
      "Named views of a table (a strip and a menu), the grouped display, footer figures, bulk actions over every matching row and a row drawer. Open a view, then click a run.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Views strip",
      text: 'views.layout "strip": counted views whose filters hold server tokens ({{user.id}}, {{now-7d}}), tone, defaultView and users\' own saved views (userViews). Open one from the URL with ?runs.view=failing.',
      to: "/table-view/table-view-views?runs.view=failing",
    },
    {
      label: "Timeline",
      text: "A view opening the grouped display (grouped by day, collapsible, counted), with its own hidden columns and compact density.",
    },
    {
      label: "Select runs",
      text: 'The bulk "Re-run" runs on the selection, or on every matching run after "Select all N matching" (bulk.allMatching, resolveBulkRowIds).',
    },
    {
      label: "Footer",
      text: "Figures computed by the server (summed output, failing count), a countLabel and the status legend.",
    },
    {
      label: "Click a run",
      text: 'Its drawer (isDefault, deepLink) steps with J / K and keeps ?record= in the URL; "Inspect in side sheet" opens it from the right. Search for nothing: the filtered empty state.',
    },
    {
      label: "Runs by status",
      text: 'views.layout "menu", grouped by status by default: pick another column to group by from its options menu.',
    },
    {
      label: "Cells",
      text: "The columns draw status pills, a pill toned by the row, pills styled per row, progress, sparkline, duration, bytes and mono cells; every display is on the Cell displays page.",
      to: "/table-view/table-view-cell-displays",
    },
  ]);

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
    footer: {
      countLabel: "$demo.job_runs.count",
      summary: [
        { label: "Output", field: "outputBytes", op: "sum" },
        {
          label: "Failing",
          op: "count",
          where: { field: "status", equals: "failing" },
        },
      ],
      legend: "status",
    },
    emptyStates: {
      filtered: {
        title: "$demo.job_runs.empty_filtered_title",
        description: "$demo.job_runs.empty_filtered_description",
        icon: "i-ph-magnifying-glass",
        actions: [
          { label: "$demo.job_runs.empty_docs", to: "https://antelopejs.com" },
        ],
      },
    },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      hasSelection: true,
      custom: [
        {
          label: "Run details",
          icon: "i-ph-sidebar-simple",
          isDefault: true,
          deepLink: true,
          target: {
            type: "drawer",
            component: CustomComponent("RunDetailsDrawer"),
            title: "Run details",
          },
        },
        {
          label: "Inspect in side sheet",
          icon: "i-ph-sidebar",
          target: {
            type: "drawer",
            direction: "right",
            component: CustomComponent("RunDetailsDrawer"),
            title: "Run details",
          },
        },
        {
          label: "Re-run",
          icon: "i-ph-arrow-clockwise",
          bulk: { allMatching: true },
          confirm: {
            title: "$demo.job_runs.rerun_title",
            description: "$demo.job_runs.rerun_description",
            confirmLabel: "$demo.job_runs.rerun_confirm",
          },
          target: {
            type: "api",
            url: "/api/playground/job-runs/rerun",
            successMessage: "$demo.job_runs.rerun_done",
          },
        },
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
