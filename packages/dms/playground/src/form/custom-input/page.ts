import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

export const FORM_CUSTOM_INPUT_API = "/api/form-custom-input";

const RETENTION_RANGE = { min: 7, max: 364 };

/**
 * A field drawn by a component of the module's own frontend layer
 * (`RetentionInput.vue`): it uses `DmsInputNumber` and its `adjust` event,
 * refuses a value with `useControlError`, and asks the form it sits in
 * (`useEnclosingForm`) to wait for a confirmation before a save that lowers
 * the retention. Below, a hand-built form draws `DmsFormRequiredLegend`.
 */
@RegisterPage()
export class PageFormCustomInput extends PageController(
  "form-custom-input",
  {
    displayName: "Custom input",
    icon: "i-ph-puzzle-piece",
    category: pageCategory,
    order: 9.2,
    description:
      "A field drawn by the module's own Vue component. Type 400 or 10 days, lower the value and save: it asks first.",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "History retention",
    description:
      "400 is brought back to 364 (adjust note); 10 is refused (not whole weeks); a lower value asks before saving. Jump to name focuses the other field.",
    fetchUrl: `${FORM_CUSTOM_INPUT_API}/get`,
    submitUrl: `${FORM_CUSTOM_INPUT_API}/save`,
    fields: [
      {
        id: "name",
        label: "Log name",
        type: new DefaultDataTypes.StringType({ minLength: 2 }),
        required: true,
      },
      {
        id: "retentionDays",
        label: "Keep history for",
        description: "In whole weeks: 7 to 364 days.",
        type: new DefaultDataTypes.NumberType(RETENTION_RANGE),
        inputComponent: CustomComponent("RetentionInput")
          .options(RETENTION_RANGE)
          .serializeSync(),
        required: true,
      },
    ],
  });

  static legend = CustomComponent("FormRequiredLegendDemo").meta({
    name: "Required legend in a hand-built form",
    icon: "i-ph-asterisk",
  });
}
