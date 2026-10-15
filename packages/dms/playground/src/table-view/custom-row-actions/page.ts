import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { tableViewCategory } from "../category";
import { demoFormPages } from "../form-texts";
import { demoGuide } from "../guide";
import { customRowActionsTaskDataAPI } from "./data-api";

const ROUTES = "/api/tasks/custom-row-actions";
/** A permission no role grants: only an owner is served the button. */
const NEVER_GRANTED = "playground.never-granted";

@RegisterPage()
export class PageTableViewCustomRowActions extends PageController(
  "table-view-custom-row-actions",
  {
    displayName: "Custom Row Actions",
    icon: "i-ph-lightning",
    category: tableViewCategory,
    order: 60,
    description:
      "Custom row actions on every kind of target, custom toolbar and header buttons, and the built-in actions renamed or confirmed by the server. Open a row's ⋯ menu, select rows, or press the buttons.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Complete",
      text: 'An inline action (isVisible, showLabel, variant, color) with a rule using "notIn": it leaves completed and cancelled tasks.',
    },
    {
      label: "The ⋯ menu",
      text: 'menuLabel names it "Actions for <task>". Its entries: an api call copying the answer (copy), a confirmed "Cancel {name}" (a "not" rule, permission "edit"), a download, a modal, a quick action, a page link filled with {{row.status}}.',
    },
    {
      label: "Rename, Delete",
      text: "Built-in actions with their own label and icon; delete asks a confirmation the server words per row (confirm.from): a completed task is blocked. successMessage counts the rows.",
    },
    {
      label: "Select rows",
      text: 'The bulk "Set priority" action opens a drawer receiving the selection.',
    },
    {
      label: "Buttons",
      text: 'customButtons: "Complete all pending" (confirmed api call, also pressed by the "Complete all pending tasks" quick action), "Import CSV" in the page header and disabled with a reason (availability), a "Purge" button gated by a permission no role grants (permissionId: only an owner sees it) and one availability hides. "Add" sits in the page header (add.placement).',
    },
  ]);

  static table = TableView(customRowActionsTaskDataAPI, {
    caption: "Tasks - Custom Row Actions",
    labelKey: "name",
    formContainer: { type: "page", pages: demoFormPages("task") },
    defaultSort: { field: "due_date", desc: true },
    customButtons: [
      {
        id: "complete-all",
        label: "Complete all pending",
        icon: "i-ph-checks",
        variant: ButtonVariant.outline,
        permission: "edit",
        confirm: {
          title: "Complete every pending task?",
          color: "warning",
          confirmLabel: "Complete",
        },
        target: {
          type: "api",
          url: `${ROUTES}/complete-all`,
          method: "POST",
          successMessage: "Pending tasks completed",
        },
      },
      {
        id: "import",
        label: "Import CSV",
        icon: "i-ph-upload-simple",
        placement: "header",
        availability: () => ({ reason: "Imports are off in the playground" }),
        target: {
          type: "modal",
          size: "md",
          component: CustomComponent("DrawerModalDemoContent"),
          title: "Import",
        },
      },
      {
        id: "purge",
        label: "Purge",
        icon: "i-ph-trash",
        color: "error",
        permissionId: NEVER_GRANTED,
        target: {
          type: "external",
          url: "https://antelopejs.com",
          newTab: true,
        },
      },
      {
        id: "hidden-here",
        label: "Hidden",
        availability: () => ({ hidden: true }),
        target: { type: "page", url: "/" },
      },
    ],
    rowActions: {
      add: { placement: "header" },
      copyLink: true,
      details: true,
      duplicate: true,
      hasSelection: true,
      menuLabel: "Actions for {name}",
      edit: { label: "Rename", icon: "i-ph-pencil-simple" },
      delete: {
        confirm: { from: `${ROUTES}/removal-confirm?id={{row._id}}` },
        successMessage: "{count} task deleted | {count} tasks deleted",
      },
      custom: [
        {
          id: "complete",
          label: "Complete",
          icon: "i-ph-check-circle",
          isVisible: true,
          showLabel: true,
          variant: ButtonVariant.soft,
          color: "success",
          rule: { field: "status", notIn: ["completed", "cancelled"] },
          target: {
            type: "api",
            url: `${ROUTES}/complete?id={{row._id}}`,
            method: "POST",
            successMessage: "Task completed",
          },
        },
        {
          label: "Copy share link",
          icon: "i-ph-link",
          target: {
            type: "api",
            url: `${ROUTES}/share?id={{row._id}}`,
            method: "POST",
            copy: "url",
            successMessage: "Share link copied",
          },
        },
        {
          label: "Cancel {name}",
          icon: "i-ph-x-circle",
          color: "error",
          permission: "edit",
          rule: { not: { field: "status", equals: "cancelled" } },
          confirm: {
            title: "Cancel {name}?",
            description: "Its assignees stop working on it.",
            icon: "i-ph-warning",
            color: "error",
            confirmLabel: "Cancel the task",
            cancelLabel: "Keep it",
          },
          target: {
            type: "api",
            url: `${ROUTES}/cancel?id={{row._id}}`,
            method: "POST",
            successMessage: "Task cancelled",
          },
        },
        {
          label: "Download JSON",
          icon: "i-ph-file-arrow-down",
          target: {
            type: "download",
            url: `${ROUTES}/export?id={{row._id}}`,
            filename: "task-{{row._id}}.json",
          },
        },
        {
          label: "Open in a modal",
          icon: "i-ph-app-window",
          target: {
            type: "modal",
            size: "md",
            component: CustomComponent("TaskSummaryModal"),
            title: "Task",
          },
        },
        {
          label: "New task (quick action)",
          icon: "i-ph-lightning",
          target: { type: "quickAction", id: "playground:new-task" },
        },
        {
          label: "Tasks of this status",
          icon: "i-ph-arrow-square-out",
          target: {
            type: "page",
            url: "/table-view/table-view-tasks-by-status/{{row.status}}",
          },
        },
        {
          label: "Set priority",
          icon: "i-ph-flag",
          bulk: true,
          target: {
            type: "drawer",
            direction: "right",
            component: CustomComponent("BulkPriorityDrawer"),
            title: "Set the priority",
          },
        },
      ],
    },
  });
}
