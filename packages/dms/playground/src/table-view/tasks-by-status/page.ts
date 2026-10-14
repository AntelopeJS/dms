import {
  Context,
  Controller,
  Get,
  type RequestContext,
} from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";
import { demoGuide } from "../guide";
import { TASK_STATUSES } from "../status";

const PAGE_ID = "table-view-tasks-by-status";
const PAGE_PATH = `/table-view/${PAGE_ID}`;
const STATUSES_URL = "/api/playground/task-statuses";

@RegisterDataController()
class byStatusTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/by-status", taskDataAPI),
) {}

/**
 * The statuses other than the one a page URL names (`?exclude=`), for the
 * "Other statuses" source table, which fills it from the page's `:status`.
 */
export class TaskStatusesController extends Controller(STATUSES_URL) {
  @Get("/")
  list(@Context() ctx: RequestContext) {
    const excluded = ctx.url.searchParams.get("exclude");
    const results = TASK_STATUSES.filter(
      (status) => status.value !== excluded,
    ).map((status) => ({
      _id: status.value,
      label: status.label,
      path: `${PAGE_PATH}/${status.value}`,
    }));
    return { results, total: results.length };
  }
}

@RegisterPage()
export class PageTableViewTasksByStatus extends PageController(
  PAGE_ID,
  {
    displayName: "Tasks of one status",
    icon: "i-ph-funnel-simple",
    category: tableViewCategory,
    urlSlug: `${PAGE_ID}/:status`,
    hidden: true,
    order: 41,
    description:
      "A page whose URL names a status (/pending): routeParamFilters scopes the table on it, and a source table names it with {{params.status}}.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Change the status in the URL",
      text: 'routeParamFilters { status: { field: "status" } } filters the tasks on the :status of the page slug, a filter the user cannot clear; columns.hidden drops the column it would repeat.',
    },
    {
      label: "Open another status",
      text: "The source table's fetchUrl ends with ?exclude={{params.status}}: it lists the other statuses, and a click opens one.",
    },
  ]);

  static tasks = TableView(byStatusTaskDataAPI, {
    caption: "Tasks of this status",
    labelKey: "name",
    routeParamFilters: { status: { field: "status" } },
    columns: { hidden: ["status", "thumbnail", "photos", "address"] },
    formContainer: { type: "drawer", pages: demoFormPages("task") },
    rowActions: {
      add: false,
      duplicate: false,
      edit: true,
      delete: false,
      details: true,
    },
  });

  static otherStatuses = TableView.fromSource({
    caption: "Other statuses",
    fetchUrl: `${STATUSES_URL}?exclude={{params.status}}`,
    labelKey: "label",
    rowClick: "single",
    columns: {
      label: { name: "Status", type: new DefaultDataTypes.StringType() },
    },
    rowActions: {
      custom: [
        {
          label: "Open",
          icon: "i-ph-arrow-right",
          isDefault: true,
          target: { type: "page", url: "{{row.path}}" },
        },
      ],
    },
  });
}
