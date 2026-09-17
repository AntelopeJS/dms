import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { level3BCategory } from "../../category";

@RegisterPage()
export class PageNested4B2 extends PageController(
  "nested-4b-2",
  {
    displayName: "Page 4B-2",
    icon: "i-ph-file",
    category: level3BCategory,
    order: 1,
    description: "Deeply nested page at level 4",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Page 4B-2",
    description: "This is another deeply nested page at level 4",
    fields: [
      {
        id: "select",
        label: "Select",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Option A", value: "a" },
            { label: "Option B", value: "b" },
            { label: "Option C", value: "c" },
          ],
          placeholder: "Select an option...",
        }),
      },
    ],
  });
}
