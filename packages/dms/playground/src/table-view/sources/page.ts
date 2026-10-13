import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Card } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  DefaultDisplays,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { BROKEN_ROUTE, REQUEST_LOG_TOPIC } from "./request-log";

const PAGE_PATH = "/table-view/table-view-sources";
const DEMO_ROUTES = [
  "GET /api/orders",
  "POST /api/customers",
  "GET /api/search?q=shoes&page=2",
  BROKEN_ROUTE,
];

const routeLink = (route: string) => ({
  label: route,
  to: `${PAGE_PATH}?route=${encodeURIComponent(route)}`,
  icon: "i-ph-funnel",
});

@RegisterPage()
export class PageTableViewSources extends PageController(
  "table-view-sources",
  {
    displayName: "Sources",
    icon: "i-ph-plugs-connected",
    category: tableViewCategory,
    order: 38,
    description:
      "TableView.fromSource lists the rows of a module route, without a data controller. Import a batch from the header, or pick a route in the second table's head.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      // A header button that changed something refreshes the page's blocks:
      // the request log reads its rows again.
      {
        label: "Import a batch",
        icon: "i-ph-download-simple",
        target: {
          type: "api",
          url: "/api/playground/request-log/batch",
          method: "POST",
          successMessage: "3 requests imported",
        },
      },
      // Lands 2 s later and publishes on the topic the request log follows.
      {
        label: "Import in background",
        icon: "i-ph-broadcast",
        target: {
          type: "api",
          url: "/api/playground/request-log/batch/background",
          method: "POST",
          successMessage: "Import started; the log updates when it lands",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Request log",
      text: 'The route filters on the method (capabilities.filter, the GET / POST tabs) and answers every row: the browser searches, sorts and pages them. "Load more" pagination.',
    },
    {
      label: "Import a batch",
      text: "A page header button that changed something refreshes the page's blocks: the log reads its rows again.",
    },
    {
      label: "Import in background",
      text: "The rows land 2 s later and the route publishes on the log's realtimeTopic: the table reads them again by itself.",
    },
    {
      label: "Requests of a route",
      text: "fetchUrl names the page URL ({{query.route}}): it lists nothing until a route is picked. GET /api/broken fails: emptyStates.error says so, with Try again.",
    },
    {
      label: "More",
      text: "The API request log page does it all on the server (search, sort, paging, period, side panel).",
      to: "/table-view/table-view-request-log",
    },
  ]);

  static requests = TableView.fromSource({
    caption: "Request log",
    fetchUrl: "/api/playground/request-log",
    capabilities: { filter: true },
    pagination: "loadMore",
    realtimeTopic: REQUEST_LOG_TOPIC,
    columns: {
      method: {
        name: "Method",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.MonoDisplay(),
        size: 100,
        sortable: true,
      },
      path: {
        name: "Path",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.MonoDisplay({ copy: true }),
        size: 240,
        sortable: true,
      },
      status: {
        name: "Status",
        type: new DefaultDataTypes.NumberType(),
        sortable: true,
      },
      durationMs: {
        name: "Duration",
        type: new DefaultDataTypes.NumberType(),
        display: new DefaultDisplays.DurationDisplay(),
        sortable: true,
      },
      at: {
        name: "At",
        type: new DefaultDataTypes.DateType(),
        display: new DefaultDisplays.RelativeDateDisplay(),
        sortable: true,
      },
    },
    tabs: [
      {
        id: "get",
        label: "GET",
        filter: { accessorKey: "method", mode: "is", value: "GET" },
      },
      {
        id: "post",
        label: "POST",
        filter: { accessorKey: "method", mode: "is", value: "POST" },
      },
    ],
  });

  static routeRequests = Card({
    title: "Requests of a route",
    description:
      "fetchUrl: /api/playground/request-log/route?route={{query.route}}",
    actions: [
      ...DEMO_ROUTES.map(routeLink),
      { label: "None", to: PAGE_PATH, icon: "i-ph-x" },
    ],
    padded: false,
  }).child(
    "table",
    TableView.fromSource({
      fetchUrl: "/api/playground/request-log/route?route={{query.route}}",
      pageSize: 10,
      emptyStates: {
        error: {
          title: "The log is unavailable",
          description: "Its store did not answer. Try again in a minute.",
          icon: "i-ph-plug",
        },
      },
      columns: {
        method: {
          name: "Method",
          type: new DefaultDataTypes.StringType(),
          display: new DefaultDisplays.MonoDisplay(),
          sortable: true,
        },
        path: {
          name: "Path",
          type: new DefaultDataTypes.StringType(),
          display: new DefaultDisplays.MonoDisplay(),
          sortable: true,
        },
        status: {
          name: "Status",
          type: new DefaultDataTypes.NumberType(),
          sortable: true,
        },
      },
    }),
  );
}
