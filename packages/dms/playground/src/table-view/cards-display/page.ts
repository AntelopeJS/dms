import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  TABLE_DISPLAY_ID,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";
import { TASK_DEFAULT_SORT } from "../status";

const TASK_CARDS_DISPLAY_ID = "playground:task-cards";

@RegisterDataController()
class cardsTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/cards-display", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewCardsDisplay extends PageController(
  "table-view-cards-display",
  {
    displayName: "Cards (Custom Display)",
    icon: "i-ph-cards",
    category: tableViewCategory,
    order: 110,
    description:
      "A module's own display (registerTableViewDisplay), sharing the table's data, filters, search and paging. Each card lists its row's custom actions: \"Same status\" opens the Filter tabs page on that tab.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(cardsTaskDataAPI, {
    defaultSort: TASK_DEFAULT_SORT,
    caption: "Tasks - Cards (Custom Display)",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      delete: { isVisible: true },
      details: true,
      duplicate: true,
      edit: { isVisible: true },
      hasSelection: true,
      custom: [
        {
          id: "open-status-tab",
          label: "Same status",
          icon: "i-ph-tabs",
          target: {
            type: "page",
            url: "/table-view/table-view-tabs?tab={{row.status}}",
          },
        },
      ],
    },
    displays: [
      { id: TABLE_DISPLAY_ID },
      {
        id: TASK_CARDS_DISPLAY_ID,
        component: CustomComponent("TaskCardsDisplay"),
      },
    ],
    defaultDisplay: TASK_CARDS_DISPLAY_ID,
  });
}
