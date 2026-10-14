import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  GetPermissionId,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { VStack } from "@antelopejs/interface-dms/base/stack";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { pagesSection } from "../sections";
import { taskDataAPI } from "../table-view/data-api";
import { Task } from "../table-view/database";
import { demoFormPages } from "../table-view/form-texts";
import { TASK_DEFAULT_SORT } from "../table-view/status";
import { EXTENSION_FORM_SLOT_ID } from "./component-slot";

export const NESTED_TARGET_API = "/api/playground/nested-target";

@RegisterDataController()
class pageExtensionTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/page-extension", taskDataAPI),
) {}

@RegisterPage()
export class PageExtensionTargetPage extends PageController("page-extension", {
  displayName: "Page Extension",
  icon: "i-ph-puzzle-piece",
  category: pagesSection,
  order: 50,
  description:
    "Demonstrates: @RegisterPageExtension (.before, .after, .order, a nested anchor) and RegisterComponentSlot. Each placeholder names the extension that injected it.",
}) {
  static intro = Placeholder({
    label: "intro — declared by the target page",
  }).meta({ name: "Intro" });

  static table = Placeholder({
    label: "table — declared by the target page",
  }).meta({ name: "Table" });

  static content = VStack({ alignment: "stretch", spacing: "12px" }).child(
    "tasks",
    TableView(pageExtensionTaskDataAPI, {
      defaultSort: TASK_DEFAULT_SORT,
      caption: "Nested tasks — targeted through content.tasks",
      labelKey: "name",
      rowActions: { add: true, edit: true },
      formContainer: {
        type: "modal",
        size: "xl",
        pages: demoFormPages("task"),
      },
    }),
  );

  static slotted = Form({
    title: "A form open to a slot owner",
    description: "The page declares this text; the slot owner replaces it.",
    slotId: EXTENSION_FORM_SLOT_ID,
    saveMode: "none",
    fields: [
      {
        id: "note",
        label: "Note",
        description:
          "A field of the page's own: the slot owner only rewrites the texts above.",
        type: new DefaultDataTypes.StringType({ placeholder: "Anything" }),
      },
    ],
  });

  static guard = KeyValueList({
    title: "AuthUserWithPermission(nestedTasksTarget)",
    fetchUrl: `${NESTED_TARGET_API}/permission`,
  });
}

export const nestedTasksTarget =
  PageExtensionTargetPage.content.targetChild("tasks");

function resolveNestedTasksPermissionId(): string {
  const permissionId = GetPermissionId(nestedTasksTarget);
  if (permissionId) return permissionId;
  throw new Error("The playground nested component target did not resolve");
}

export const nestedTasksPermissionId = resolveNestedTasksPermissionId();
