import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { dynamicNavigationCategory } from "./category";

// Call-to-action entry: a static page of the same category, ordered after the
// dynamic ones and rendered in the theme's primary color.
@RegisterPage()
export class DynamicNavigationNewProjectPage extends PageController(
  "new-project",
  {
    displayName: "New project",
    icon: "i-ph-plus",
    category: dynamicNavigationCategory,
    order: 100,
    variant: "accent",
    description:
      "Demonstrates: MenuOptions.variant accent on a static page, sorted after the dynamic entries by its order.",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "New project",
    fields: [
      {
        id: "name",
        label: "Name",
        type: new DefaultDataTypes.StringType({
          placeholder: "my-project",
        }),
      },
    ],
  });
}
