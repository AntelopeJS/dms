import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

export const FORM_SAVING_API = "/api/form-saving";
const PAGE_PATH = "/form/form-saving";

const contactFields = () => [
  {
    id: "name",
    label: "Name",
    description: "Type fail to make the save fail.",
    type: new DefaultDataTypes.StringType({ minLength: 2 }),
    required: true,
  },
  {
    id: "email",
    label: "Email",
    type: new DefaultDataTypes.EmailType(),
  },
];

/**
 * How a form offers to save and what follows a submit: the buttons in the
 * form's footer with a Cancel (`backTo`), no buttons at all, and an `action`
 * form whose payload takes defaults from the URL and whose answer adds a
 * toast, a warning and a redirect.
 */
@RegisterPage()
export class PageFormSaving extends PageController(
  "form-saving",
  {
    displayName: "Saving & submit",
    icon: "i-ph-floppy-disk",
    category: pageCategory,
    order: 9.4,
    description:
      "Footer buttons, no buttons, and an action form with defaults, a notice, a warning and a redirect. Open it with ?workspace=acme, then send invites.",
  },
  FormPageLayout(),
) {
  static help = Banner({
    title: "The invite form takes its workspace from the URL",
    description:
      "submitDefaults adds the URL's workspace to the payload; redirectOnSuccess puts the answer's count in ?invited=. Inviting ops@acme.io returns a warning.",
    size: "sm",
    actions: [
      { label: "Open with ?workspace=acme", to: `${PAGE_PATH}?workspace=acme` },
      {
        label: "An action form in a page: test notification",
        to: "/notification/notification-test",
      },
      { label: "A form inside a Section", to: "/blocks/blocks-settings" },
    ],
  });

  static footer = Form({
    title: "Footer buttons",
    description:
      "saveMode footer: the buttons sit under the fields. Clean, Cancel leads to the Simple form (backTo); the breadcrumb ends with the name (labelKey).",
    saveMode: "footer",
    backTo: "/form/form-simple",
    fetchUrl: `${FORM_SAVING_API}/get`,
    fetchUrlMethod: HttpMethod.get,
    submitUrl: `${FORM_SAVING_API}/save`,
    submitUrlMethod: HttpMethod.put,
    labelKey: "name",
    successMessage: "Contact saved",
    errorMessage: "The save failed: try again.",
    fields: contactFields(),
  });

  static summary = Form({
    title: "Read-only summary",
    description:
      "saveMode none: no buttons; the same record, saved by the form above.",
    saveMode: "none",
    fetchUrl: `${FORM_SAVING_API}/get`,
    fields: contactFields(),
  });

  static invite = Form({
    title: "Invite",
    description:
      "kind action: Reset and Send invites show once a value changes, and the form empties after a successful submit.",
    kind: "action",
    submitUrl: `${FORM_SAVING_API}/invite`,
    submitUrlMethod: HttpMethod.post,
    submitLabel: "Send invites",
    submitDefaults: {
      workspace: "{{query.workspace}}",
      source: "playground",
    },
    redirectOnSuccess: `${PAGE_PATH}?invited={{response.count}}`,
    fields: [
      {
        id: "emails",
        label: "Emails",
        type: new DefaultDataTypes.TagsType({ itemType: "email" }),
        required: true,
      },
    ],
  });
}
