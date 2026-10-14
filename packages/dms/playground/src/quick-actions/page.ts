import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { chromeSection } from "../sections";
import { QUICK_ACTIONS_DEMO_API } from "./api";

/** The table button the `press-button` quick action presses. */
export const PRESS_BUTTON_ID = "log-press";

@RegisterPage()
export class QuickActionsPage extends PageController(
  "quick-actions",
  {
    displayName: "Quick actions",
    icon: "i-ph-lightning",
    category: chromeSection,
    order: 20,
    description:
      "Demonstrates: QuickAction with every target (navigate, openForm, button, event) and a header button running one. Press Ctrl K (⌘K) and type “playground”.",
  },
  DefaultLayout({
    headerActions: [
      {
        id: "run-quick-action",
        label: "",
        target: { type: "quickAction", id: "playground:open-invoicer" },
      },
    ],
  }),
) {
  static actions = TableView.fromSource({
    caption: "The playground's quick actions",
    fetchUrl: QUICK_ACTIONS_DEMO_API,
    labelKey: "name",
    customButtons: [
      {
        id: PRESS_BUTTON_ID,
        label: "Log a press",
        icon: "i-ph-hand-pointing",
        placement: "header",
        target: {
          type: "api",
          method: "POST",
          url: `${QUICK_ACTIONS_DEMO_API}/press`,
          successMessage: "Pressed: the table ran its header button",
        },
      },
    ],
    columns: {
      name: {
        name: "Quick action",
        type: new DefaultDataTypes.StringType(),
        size: 260,
      },
      target: {
        name: "Target",
        type: new DefaultDataTypes.StringType(),
        size: 180,
      },
      effect: {
        name: "What it does",
        type: new DefaultDataTypes.StringType(),
        size: 360,
      },
    },
  });
}
