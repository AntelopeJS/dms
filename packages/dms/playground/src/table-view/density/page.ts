import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { taskDataAPI } from "../data-api";
import { demoFormTexts } from "../form-texts";

const SCROLL_HEIGHT = "420px";

const ROW_ACTIONS = {
  add: true,
  details: true,
  edit: true,
  delete: true,
  hasSelection: true,
};

@RegisterPage()
export class PageTableViewDensity extends PageController(
  "table-view-density",
  {
    displayName: "Density & sticky header",
    icon: "i-ph-rows",
    category: tableViewCategory,
    order: 32,
    description:
      'density: "compact" (36px rows under a 32px header) next to the default density. Both set stickyHeader with maxHeight "420px": the default table scrolls at 10 rows, the compact one fits 10 rows and scrolls under its header from 25 rows per page',
  },
  DefaultLayout({ fullWidth: true }),
) {
  static compact = TableView(taskDataAPI, {
    caption: 'Compact · density "compact" · sticky header · 420px',
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    density: "compact",
    stickyHeader: true,
    maxHeight: SCROLL_HEIGHT,
    rowActions: ROW_ACTIONS,
  });

  static comfortable = TableView(taskDataAPI, {
    caption: "Default density · sticky header · 420px",
    labelKey: "name",
    formTexts: demoFormTexts("task"),
    stickyHeader: true,
    maxHeight: SCROLL_HEIGHT,
    rowActions: ROW_ACTIONS,
  });
}
