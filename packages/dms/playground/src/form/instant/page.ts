import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const DIGEST_ITEMS = [
  { label: "Never", value: "never" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

/**
 * A form that saves as it goes: a pick saves at once, a text once typing
 * pauses, each with its own state; the header carries the "Saved instantly"
 * pill. The workspace name `taken` is refused (an error under the field) and
 * `offline` fails the request: the value goes back, and Retry sends it again.
 */
@RegisterPage()
export class PageFormInstant extends PageController(
  "form-instant",
  {
    displayName: "Instant save",
    icon: "i-ph-lightning",
    category: pageCategory,
    order: 7,
    description: "A form saving each change on its own",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Workspace preferences",
    description:
      "Changes save as you make them. Type taken (refused) or offline (failed request) as the name to see a save put back.",
    saveMode: "instant",
    fetchUrl: "/api/form-instant/get",
    submitUrl: "/api/form-instant/save",
    sections: [
      {
        id: "general",
        label: "General",
        icon: "i-ph-gear",
        fields: [
          {
            id: "name",
            label: "Workspace name",
            type: new DefaultDataTypes.StringType({ minLength: 2 }),
            required: true,
          },
          {
            id: "website",
            label: "Website",
            type: new DefaultDataTypes.UrlType(),
          },
        ],
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: "i-ph-bell",
        fields: [
          {
            id: "digest",
            label: "Email digest",
            type: new DefaultDataTypes.SelectType({ items: DIGEST_ITEMS }),
          },
          {
            id: "mentions",
            label: "Notify me of mentions",
            type: new DefaultDataTypes.BooleanType(),
          },
        ],
      },
      {
        id: "advanced",
        label: "Advanced",
        icon: "i-ph-wrench",
        fields: [
          {
            id: "retention",
            label: "Keep history for (days)",
            type: new DefaultDataTypes.NumberType({ min: 1, max: 365 }),
          },
        ],
      },
    ],
  });
}
