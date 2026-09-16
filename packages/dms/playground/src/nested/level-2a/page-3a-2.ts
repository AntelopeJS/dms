import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { level2ACategory } from "../category";

@RegisterPage()
export class PageNested3A2 extends PageController(
  "nested-3a-2",
  {
    displayName: "Page 3A-2",
    icon: "i-ph-file",
    category: level2ACategory,
    order: 1,
    description: "Nested page at level 3 (branch A)",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Page 3A-2",
    description: "This is another nested page at level 3 in branch A",
    fields: [
      {
        id: "email",
        label: "Email",
        type: new DefaultDataTypes.EmailType({
          placeholder: "email@example.com",
        }),
      },
    ],
  });
}
