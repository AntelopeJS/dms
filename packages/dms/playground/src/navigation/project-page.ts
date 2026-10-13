import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  DYNAMIC_NAVIGATION_OVERVIEW_URL,
  dynamicNavigationCategory,
} from "./category";

/** Registered by the playground's page-validation-demo frontend plugin. */
export const KNOWN_PROJECT_FUNCTION_ID = "playground:known-project";

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
    description:
      "Demonstrates: validation (requiredQueryParams, customFunctionId, redirectTo). One page serves every ?project=<id> entry; an unknown id is redirected to the overview.",
    validation: {
      requiredQueryParams: ["project"],
      customFunctionId: KNOWN_PROJECT_FUNCTION_ID,
      redirectTo: `${DYNAMIC_NAVIGATION_OVERVIEW_URL}?missing={{query.project}}`,
    },
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
