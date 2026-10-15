import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { LiveToggle, PeriodSelector } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HStack } from "@antelopejs/interface-dms/base/stack";
import {
  DefaultDisplays,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { REQUEST_LOG_TOPIC } from "../sources/request-log";

const PAGE_PATH = "/table-view/table-view-request-log";
const PERIOD_SCOPE = "request-log-period";
const LIVE_MAX_RATE = 2;
const PAGE_SIZE = 20;
const SERVER_ERROR = 500;
const CLIENT_ERROR = 400;

const METHODS = [
  { value: "GET", label: "GET", textColor: "info" },
  { value: "POST", label: "POST", textColor: "success" },
  { value: "PUT", label: "PUT", textColor: "warning" },
  { value: "DELETE", label: "DELETE", textColor: "error" },
];

const statusTab = (id: string, label: string, from: number) => ({
  id,
  label,
  filter: {
    accessorKey: "status",
    mode: "greater_than_or_equal_to",
    value: String(from),
  },
});

@RegisterPage()
export class PageTableViewRequestLog extends PageController(
  "table-view-request-log",
  {
    displayName: "API request log (side panel)",
    icon: "i-ph-sidebar-simple",
    category: tableViewCategory,
    order: 39,
    description:
      "A log read row after row in a side panel, the route searching, sorting and paging on the server. Click a request, step with J / K, pause the page to hold the rows.",
    live: { maxRate: LIVE_MAX_RATE },
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Import in background",
        icon: "i-ph-broadcast",
        target: {
          type: "api",
          url: "/api/playground/request-log/batch/background",
          method: "POST",
          successMessage: "Import started; 3 requests land in 2 s",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Single-click a request",
      text: 'rowClick: "single" runs the isDefault action, a sidePanel target: the table stays usable, J / K step, Esc closes, ?record= follows the row.',
    },
    {
      label: "Previous request on this route",
      text: "The panel's button calls showRow(id): the older request opens in place, read through fetchRowUrl when it is beyond the page.",
    },
    {
      label: "Open an unlisted request",
      text: "?record=req-3 is read through fetchRowUrl and opens without its position; ?record=nope answers 404: the panel shows its notFound texts.",
      to: `${PAGE_PATH}?record=req-3`,
    },
    {
      label: "Search, sort, page",
      text: 'capabilities { search, sort, paginate, filter }: the route does it all. Press "/" to search (searchShortcut). 5xx rows are pinned first (pinnedRows with "in").',
    },
    {
      label: "Pause the page",
      text: 'Pause, then "Import in background": the table holds its rows (liveHold, the route reads liveHeldAt) and counts the new requests in its strip. Holding also happens while a row is open, a search or a sort is on.',
    },
    {
      label: "Change the period",
      text: "periodScope: the route receives from / to and lists the requests of that period.",
    },
  ]);

  static toolbar = HStack({ spacing: "12px", alignment: "center" })
    .child(
      "period",
      PeriodSelector({
        id: PERIOD_SCOPE,
        variant: "segmented",
        defaultPreset: "last-24h",
        presets: ["last-hour", "last-24h", "last-7-days"],
      }),
    )
    .child(
      "live",
      LiveToggle({ missedLabel: "$demo.table_view.new_requests" }),
    );

  static requests = TableView.fromSource({
    caption: "Requests",
    fetchUrl: "/api/playground/request-log-server",
    fetchRowUrl: "/api/playground/request-log-server/rows/{{row.id}}",
    rowIdKey: "requestId",
    labelKey: "path",
    capabilities: { filter: true, search: true, sort: true, paginate: true },
    periodScope: PERIOD_SCOPE,
    rowClick: "single",
    searchShortcut: "/",
    searchPlaceholder: "Search a method or a path",
    pageSize: PAGE_SIZE,
    defaultSort: { field: "at", desc: true },
    pinnedRows: { field: "status", in: [SERVER_ERROR] },
    quickFilters: [{ field: "method", allLabel: "Any method" }],
    tabs: [
      statusTab("errors", "Errors", CLIENT_ERROR),
      statusTab("server-errors", "5xx", SERVER_ERROR),
    ],
    realtimeTopic: REQUEST_LOG_TOPIC,
    liveHold: {
      whileRowOpen: true,
      whileSearching: true,
      whileSorted: true,
      missedLabel: "$demo.table_view.new_requests",
    },
    footer: {
      countLabel: "$demo.table_view.request_count",
      hint: "J / K step through the open panel",
      legend: "method",
    },
    rowActions: {
      menuLabel: "Actions for {method} {path}",
      custom: [
        {
          label: "Request",
          icon: "i-ph-sidebar-simple",
          isDefault: true,
          target: {
            type: "sidePanel",
            component: CustomComponent("RequestLogPanel"),
            title: "Request",
            rowTitle: "{method} {path}",
            positionLabel: "Request {index} of {total} shown",
            notFound: {
              title: "This request is no longer stored",
              description:
                "It was pruned by the log retention, or the link is wrong.",
            },
          },
        },
        {
          label: "Download as JSON",
          icon: "i-ph-file-arrow-down",
          target: {
            type: "download",
            url: "/api/playground/request-log-server/rows/{{row.requestId}}",
            filename: "{{row.requestId}}.json",
          },
        },
      ],
    },
    columns: {
      method: {
        name: "Method",
        type: new DefaultDataTypes.SelectType({ items: METHODS }),
        filterable: true,
        sortable: true,
        size: 100,
      },
      path: {
        name: "Path",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.MonoDisplay({ copy: true }),
        sortable: true,
        size: 260,
      },
      status: {
        name: "Status",
        type: new DefaultDataTypes.NumberType(),
        display: new DefaultDisplays.StatusPillDisplay({
          toneField: "statusTone",
        }),
        filterable: true,
        sortable: true,
        size: 110,
      },
      durationMs: {
        name: "Duration",
        type: new DefaultDataTypes.NumberType(),
        display: new DefaultDisplays.DurationDisplay({
          format: "ms",
          toneField: "durationTone",
        }),
        sortable: true,
        size: 120,
      },
      at: {
        name: "At",
        type: new DefaultDataTypes.DateType(),
        display: new DefaultDisplays.RelativeDateDisplay(),
        sortable: true,
      },
    },
  });
}
