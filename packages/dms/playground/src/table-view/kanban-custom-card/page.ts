import { Controller, Parameter, Post } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task } from "../database";
import { demoFormPages } from "../form-texts";
import { demoGuide } from "../guide";

@RegisterDataController()
class kanbanCardTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/kanban-custom-card", taskDataAPI),
) {
  /** The cards' "Start" button: a custom row action the card places itself. */
  @Post("start")
  async start(@Parameter("id", "query") id: string) {
    await this.model.update(id, { status: "in_progress" });
    return { ok: true };
  }
}

@RegisterPage()
export class PageTableViewKanbanCustomCard extends PageController(
  "table-view-kanban-custom-card",
  {
    displayName: "Kanban & cards (no grid)",
    icon: "i-ph-cards",
    category: tableViewCategory,
    order: 100,
    description:
      'A board and a card grid drawing each task with a custom card, and no table (tableDisplay: false). Switch displays, then press "Start" on a pending card.',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Display switcher",
      text: 'tableDisplay: false drops the grid: the switcher offers the kanban board and the built-in "cards" display only.',
    },
    {
      label: "Custom card",
      text: "card.component (KanbanTaskCard) draws both displays' cards from the same props: row, actions, selected, select(), open().",
    },
    {
      label: "Start",
      text: 'A custom row action with id "start" and a rule (pending only): the card finds it in actions.customFor(row) and runs it with actions.custom(action, row).',
    },
  ]);

  static table = TableView(kanbanCardTaskDataAPI, {
    caption: "Tasks - Kanban & cards",
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
      custom: [
        {
          id: "start",
          label: "Start",
          icon: "i-ph-play",
          rule: { field: "status", equals: "pending" },
          target: {
            type: "api",
            url: "/api/tasks/kanban-custom-card/start?id={_id}",
            method: "POST",
            successMessage: "Task started",
          },
        },
      ],
    },
    kanban: { groupByField: "status" },
    // One card for both card displays: the board and the card grid hand it
    // the same props.
    card: { component: CustomComponent("KanbanTaskCard") },
    displays: [{ id: "cards" }],
    tableDisplay: false,
    defaultDisplay: "kanban",
  });
}
