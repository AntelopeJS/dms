import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { dashboardChromeCategory } from "./category";

/** Registered by the playground's `dms-page-setup-demo.client.ts` plugin. */
const PAGE_SETUP_DEMO_ID = "dms:demo:form-lifecycle";

@RegisterPage()
export class PageChromePageSetup extends PageController(
  "chrome-page-setup",
  {
    displayName: "Page setup function",
    description:
      "A page names a module function with setupId; it runs when the page mounts, listens to the blocks' events and cleans up on leave. Type in the form and watch the log",
    icon: "i-ph-plugs-connected",
    category: dashboardChromeCategory,
    order: 60,
    setupId: PAGE_SETUP_DEMO_ID,
  },
  DefaultLayout({}),
) {
  static log = CustomComponent("PageSetupLog");

  static form = Form({
    title: "Watched form",
    description:
      "Each change sends FormEvents.FIELD_CHANGE, which the setup function logs",
    fields: [
      {
        id: "name",
        label: "Name",
        type: new DefaultDataTypes.StringType({ placeholder: "Type here" }),
      },
      {
        id: "status",
        label: "Status",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
          ],
        }),
      },
    ],
  });
}
