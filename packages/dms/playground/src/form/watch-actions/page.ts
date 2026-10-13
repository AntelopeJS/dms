import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  FormEvents,
  FormFunctions,
} from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const PAGE_ID = "watch-actions";
// The form's own permission: a user who reaches the form without it (a role
// granting the page only) is served the form without the gated watch.
const FORM_PERMISSION = `${pageCategory.fullId}.${PAGE_ID}.form`;
const OWNER_FIELD = "isOwner";

const whenOwner = (value: boolean) => [
  { key: "fieldId", value: OWNER_FIELD },
  { key: "value", value },
];

/**
 * Watches: a form event (`FIELD_CHANGE`) runs a form function on another
 * field (disable, hide, require), optionally behind a permission. The page's
 * setup function (`setupId`) logs every form event to the browser console:
 * field changes, submit, success, error and reset.
 */
@RegisterPage()
export class PageFormWatchActions extends PageController(
  PAGE_ID,
  {
    displayName: "Watch actions",
    icon: "i-ph-broadcast",
    category: pageCategory,
    order: 60,
    description:
      "Toggle Is owner: other fields get disabled, hidden or required. Open the browser console, then save or discard to see the form events logged.",
    setupId: "dms:demo:form-lifecycle",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Member",
    description:
      "An owner: display name disabled and required, admin notes shown. Type fail as the display name for a refused save (SUBMIT_ERROR).",
    fetchUrl: "/api/form-watch-actions/get",
    submitUrl: "/api/form-watch-actions/save",
    fields: [
      {
        id: OWNER_FIELD,
        label: "Is owner",
        type: new DefaultDataTypes.BooleanType(),
        defaultValue: false,
      },
      {
        id: "displayName",
        label: "Display name",
        description: "Disabled and required while Is owner is on.",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter a name",
        }),
      },
      {
        id: "adminNotes",
        label: "Admin notes",
        description:
          "Hidden while Is owner is off. Typing here locks Is owner (a watch behind the form's permission).",
        type: new DefaultDataTypes.StringType({ textarea: true }),
      },
      {
        id: "memberId",
        label: "Member id",
        description: "disabled: true, set on the field itself.",
        type: new DefaultDataTypes.StringType(),
        disabled: true,
      },
      {
        id: "joinedOn",
        label: "Joined on",
        description: "readonly: true, shown and never edited.",
        type: new DefaultDataTypes.DateType(),
        readonly: true,
      },
    ],
  })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      params: { targetField: "displayName", setDisabled: true },
      onParam: whenOwner(true),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      params: { targetField: "displayName", setDisabled: false },
      onParam: whenOwner(false),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
      params: { targetField: "displayName", setRequired: true },
      onParam: whenOwner(true),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
      params: { targetField: "displayName", setRequired: false },
      onParam: whenOwner(false),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
      params: { targetField: "adminNotes", setHidden: true },
      onParam: whenOwner(false),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
      params: { targetField: "adminNotes", setHidden: false },
      onParam: whenOwner(true),
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      requirePermission: FORM_PERMISSION,
      params: { targetField: OWNER_FIELD, setDisabled: true },
      onParam: { key: "fieldId", value: "adminNotes" },
    })
    .watchFilter((permissions, watches, permissionId) => {
      console.log(
        `[watch-filter] ${permissionId}: ${watches.length} watch(es) after permission filtering (user has ${permissions.size} perm(s))`,
      );
      return watches;
    });
}
