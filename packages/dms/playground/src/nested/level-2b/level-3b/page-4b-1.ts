import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { level3BCategory } from "../../category";

@RegisterPage()
export class PageNested4B1 extends PageController(
  "nested-4b-1",
  {
    displayName: "Page 4B-1",
    icon: "i-ph-file",
    category: level3BCategory,
    order: 0,
    description: "Deeply nested page at level 4",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Page 4B-1",
    description: "This is a deeply nested page at level 4",
    fields: [
      {
        id: "checkbox",
        label: "Checkbox",
        type: new DefaultDataTypes.BooleanType(),
      },
    ],
  });
}
