import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  DefaultDisplays,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { roadmapFeatureDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewSources extends PageController(
  "table-view-sources",
  {
    displayName: "Sources, order & cards",
    icon: "i-ph-plugs-connected",
    category: tableViewCategory,
    order: 37,
    description:
      'TableView.fromSource lists the rows of a module route with no data controller (the request log filters on the server, the browser searches, sorts and pages), with "Load more" pagination. The roadmap is ordered by hand: drag a row by its handle (or use the arrow keys on it) — only the moved rows are saved. Its cards display draws each feature with DmsRecordCard',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static requests = TableView.fromSource({
    caption: "Request log",
    fetchUrl: "/api/playground/request-log",
    capabilities: { filter: true },
    pagination: "loadMore",
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

  static roadmap = TableView(roadmapFeatureDataAPI, {
    caption: "Roadmap",
    labelKey: "name",
    reorder: { field: "position" },
    formContainer: { type: "drawer" },
    displays: [{ id: "cards" }],
    card: { component: CustomComponent("FeatureRecordCard") },
    rowActions: { add: true, edit: true, delete: true },
  });
}
