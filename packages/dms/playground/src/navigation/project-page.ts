import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory } from "./category";

// One page behind every dynamic entry: it is reached as `?project=<id>` and
// stays out of the menu itself, the entries being the only way in.
@RegisterPage()
export class DynamicNavigationProjectPage extends PageController(
  "project",
  {
    displayName: "Project",
    icon: "i-ph-cube",
    category: dynamicNavigationCategory,
    hidden: true,
    description: "Served to every dynamic project entry through ?project=<id>",
    validation: { requiredQueryParams: ["project"] },
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Project",
    description:
      "Reached through a query-parameter menu entry (/dynamic-nav/project?project=<id>)",
    fields: [
      {
        id: "notes",
        label: "Notes",
        type: new DefaultDataTypes.StringType({
          placeholder: "Anything about this project...",
        }),
      },
    ],
  });
}
