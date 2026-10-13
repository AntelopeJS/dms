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
import {
  assertDueDateAhead,
  assertFewRows,
  assertNameLength,
  assertNotCancelled,
  logEdit,
} from "./guards";

@RegisterDataController()
class conditionalDeleteTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/conditional-delete", taskDataAPI),
) {}

@RegisterPage()
export class PageTableViewConditionalDelete extends PageController(
  "table-view-conditional-delete",
  {
    displayName: "Conditional Delete",
    icon: "i-ph-shield-warning",
    category: tableViewCategory,
    order: 70,
    description:
      "Row rules gating edit and delete, strict rule validation and server guards. Select a completed task with others and delete, or rename a task to two letters.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Row rules",
      text: "edit and delete are offered only on tasks neither completed nor high priority (and / notEquals); details only on the others (or).",
    },
    {
      label: "Strict rules",
      text: "strictRuleValidation: true: a bulk delete mixing a refused row is refused whole, instead of deleting the rows that pass.",
    },
    {
      label: "Guards",
      text: "delete refuses more than 3 rows at once (403 toast); edit and new refuse a name under 3 letters under the name field, new a past due date under its field; get refuses a cancelled task's details (404). edit returns an AfterWrite logged on the server.",
    },
  ]);

  static table = TableView(conditionalDeleteTaskDataAPI, {
    caption:
      "Tasks - Delete/Edit allowed if task is neither high priority nor completed",
    labelKey: "name",
    strictRuleValidation: true,
    guards: {
      get: (_ctx, { current }) => assertNotCancelled(current.status),
      new: (_ctx, { body }) => {
        assertNameLength(body.name);
        assertDueDateAhead(body.due_date);
      },
      edit: (_ctx, { body, current }) => {
        assertNameLength(body.name);
        return logEdit(body.name ?? current.name);
      },
      delete: (_ctx, { ids }) => assertFewRows(ids),
    },
    formContainer: { type: "page", pages: demoFormPages("task") },
    rowActions: {
      add: true,
      copyLink: true,
      delete: {
        isEnabled: true,
        rule: {
          and: [
            { field: "status", notEquals: "completed" },
            { field: "priority", notEquals: "high" },
          ],
        },
      },
      details: {
        isEnabled: true,
        rule: {
          or: [
            { field: "status", equals: "completed" },
            { field: "priority", equals: "high" },
          ],
        },
      },
      duplicate: true,
      edit: {
        isEnabled: true,
        rule: {
          and: [
            { field: "status", notEquals: "completed" },
            { field: "priority", notEquals: "high" },
          ],
        },
      },
      hasSelection: true,
    },
  });
}
