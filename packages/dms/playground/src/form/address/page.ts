import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormAddress extends PageController(
  "form-address",
  {
    displayName: "Address Form",
    icon: "i-ph-map-pin",
    category: pageCategory,
    order: 20,
    description: "Form with address input",
  },
  FormPageLayout(),
) {
  static addressForm = Form({
    title: "Address Form",
    description: "Configure your address",
    fields: [
      {
        id: "billingAddress",
        label: "Billing Address",
        description: "Start typing a street name to get address suggestions",
        type: new DefaultDataTypes.AddressType({
          autocomplete: { enabled: true },
        }),
        required: false,
      },
    ],
  });
}
