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

const SCROLL_HEIGHT = "420px";

const ROW_ACTIONS = {
  add: true,
  details: true,
  edit: true,
  delete: true,
  hasSelection: true,
};

@RegisterDataController()
class compactTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/density-compact", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterDataController()
class comfortableTaskDataAPI extends DataController(
  Task,
  {},
  Controller("/api/tasks/density-comfortable", taskDataAPI),
) {
  @ModelReference()
  declare model: TaskModel;
}

@RegisterPage()
export class PageTableViewDensity extends PageController(
  "table-view-density",
  {
    displayName: "Density & sticky header",
    icon: "i-ph-rows",
    category: tableViewCategory,
    order: 32,
    description:
      'density: "compact" (36px rows under a 32px header) next to the default density. Both set maxHeight "420px" (their own scroll area under a sticky header): the default table scrolls at 10 rows, the compact one fits 10 rows and scrolls under its header from 25 rows per page',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static compact = TableView(compactTaskDataAPI, {
    caption: 'Compact · density "compact" · sticky header · 420px',
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    density: "compact",
    maxHeight: SCROLL_HEIGHT,
    rowActions: ROW_ACTIONS,
  });

  static comfortable = TableView(comfortableTaskDataAPI, {
    caption: "Default density · sticky header · 420px",
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    maxHeight: SCROLL_HEIGHT,
    rowActions: ROW_ACTIONS,
  });
}
