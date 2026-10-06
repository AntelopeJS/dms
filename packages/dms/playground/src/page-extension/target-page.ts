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
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { VStack } from "@antelopejs/interface-dms/base/stack";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { internalsSection } from "../sections";
import { taskDataAPI } from "../table-view/data-api";
import { Task } from "../table-view/database";
import { demoFormPages } from "../table-view/form-texts";

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
  category: internalsSection,
  order: 10,
  description: "A page other modules inject components into",
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
}

export const nestedTasksTarget =
  PageExtensionTargetPage.content.targetChild("tasks");

function resolveNestedTasksPermissionId(): string {
  const permissionId = GetPermissionId(nestedTasksTarget);
  if (permissionId) return permissionId;
  throw new Error("The playground nested component target did not resolve");
}

export const nestedTasksPermissionId = resolveNestedTasksPermissionId();
