import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { level2ACategory } from "../category";

@RegisterPage()
export class PageNested3A1 extends PageController(
  "nested-3a-1",
  {
    displayName: "Page 3A-1",
    icon: "i-ph-file",
    category: level2ACategory,
    order: 0,
    description: "Nested page at level 3 (branch A)",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Page 3A-1",
    description: "This is a nested page at level 3 in branch A",
    fields: [
      {
        id: "name",
        label: "Name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter name...",
        }),
      },
    ],
  });
}
