import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { ModelReference } from "@antelopejs/interface-data-api/metadata";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { Task, TaskModel } from "../database";
import { demoFormTexts } from "../form-texts";

@RegisterDataController()
class archiveTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/archive-mode", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewArchive extends PageController(
  "table-view-archive",
  {
    displayName: "Archive Mode",
    icon: "i-ph-archive",
    category: tableViewCategory,
    order: 80,
    description:
      'Archive rows instead of deleting them: archived rows leave the list and are viewed (and restored) with the "Archive" toolbar button',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView(archiveTaskDataAPI, {
    caption: "Tasks - Archive Mode",
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    archiveMode: true,
    rowActions: {
      add: true,
      edit: true,
      details: true,
      duplicate: true,
      hasSelection: true,
      archive: true,
      restore: true,
    },
  });
}
