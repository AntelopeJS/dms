import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  MAX_TABLE_PAGE_SIZE,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { PREVIEW_LAYOUT } from "../pages/public/preview";
import { MOCKUP_API } from "./fixtures";

const { DateType, NumberType, StringType } = DefaultDataTypes;

/**
 * `/mockup`: the viewer of `mockups/<name>/spec.json`, drawing each page with
 * `/dms-preview` and redrawing it on every save. Public and hidden, like the
 * preview it embeds; `?name=`, `?page=` and `?width=` pick what it shows.
 */
export class MockupPage extends PageController(
  "mockup",
  {
    displayName: "Mockup",
    urlSlug: "mockup",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,

    live: {},
  },
  PREVIEW_LAYOUT,
) {
  static content = CustomComponent("DmsMockupViewer");
}

export const MOCKUP_CARDS_DISPLAY_ID = "dms:mockup-cards";
const TEXTS = "$dms.mockup";

/**
 * `/mockups`: every mockup of the project as a card, from `GET /api/mockup`.
 * Hidden from the menu, and opened from a header icon only the platform
 * owner sees. A role reaches it only once granted its page permission.
 */
export class MockupsPage extends PageController(
  "mockups",
  {
    displayName: "Mockups",
    urlSlug: "mockups",
    icon: "i-ph-frame-corners-light",
    hidden: true,
    noComponentPermissions: true,
    category: pagesCategory,
  },
  DefaultLayout({ fullWidth: true }),
) {
  static table = TableView.fromSource({
    fetchUrl: MOCKUP_API,
    rowIdKey: "name",
    labelKey: "name",
    columns: {
      name: { name: `${TEXTS}.column_name`, type: new StringType() },
      title: { name: `${TEXTS}.column_title`, type: new StringType() },
      pages: {
        name: `${TEXTS}.column_pages`,
        type: new NumberType(),
        sortable: true,
      },
      openComments: {
        name: `${TEXTS}.column_open_comments`,
        type: new NumberType(),
        sortable: true,
      },
      source: { name: `${TEXTS}.column_source`, type: new StringType() },
      status: { name: `${TEXTS}.column_status`, type: new StringType() },
      updatedAt: {
        name: `${TEXTS}.column_updated`,
        type: new DateType(),
        sortable: true,
      },
    },
    defaultSort: { field: "updatedAt", desc: true },
    pageSize: MAX_TABLE_PAGE_SIZE,
    displays: [
      {
        id: MOCKUP_CARDS_DISPLAY_ID,
        component: CustomComponent("DmsMockupCards"),
      },
    ],
    defaultDisplay: MOCKUP_CARDS_DISPLAY_ID,
    emptyStates: {
      firstRun: {
        title: `${TEXTS}.empty_title`,
        description: `${TEXTS}.empty_description`,
        icon: "i-ph-frame-corners-light",
      },
    },
  });
}

/**
 * Registers `/mockup` and `/mockups`. Only called in development, which is
 * why the pages carry no decorator: importing this file registers nothing.
 */
export function registerMockupPage(): void {
  RegisterPage()(MockupPage);
  RegisterPage()(MockupsPage);
}
