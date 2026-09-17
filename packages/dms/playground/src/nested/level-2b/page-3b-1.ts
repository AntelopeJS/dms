import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { level2BCategory } from "../category";

@RegisterPage()
export class PageNested3B1 extends PageController(
  "nested-3b-1",
  {
    displayName: "Page 3B-1",
    icon: "i-ph-file",
    category: level2BCategory,
    order: 0,
    description: "Nested page at level 3 (branch B)",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Page 3B-1",
    description: "This is a nested page at level 3 in branch B",
    fields: [
      {
        id: "number",
        label: "Number",
        type: new DefaultDataTypes.NumberType({
          min: 0,
          max: 100,
          placeholder: "Enter a number",
        }),
      },
    ],
  });
}
