import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { FormEvents, FormFunctions } from "@antelopejs/interface-dms/base/form";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const GROUPED_FORM_PERMISSION = "pages.form.form-grouped.form";

@RegisterPage()
export class PageFormWatchActions extends PageController(
  "watch-actions",
  {
    displayName: "Watch Actions Demo",
    icon: "i-ph-broadcast",
    category: pageCategory,
    order: 60,
    description: "Demonstrates .watch(), .watchFilter(), and requirePermission",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Demo Form",
    description: "Toggle isOwner to see watches fire",
    fields: [
      {
        id: "isOwner",
        label: "Is Owner",
        type: new DefaultDataTypes.BooleanType(),
        defaultValue: false,
      },
      {
        id: "displayName",
        label: "Display Name",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter a name",
        }),
      },
      {
        id: "adminNotes",
        label: "Admin Notes (permission-gated watch)",
        type: new DefaultDataTypes.StringType({
          textarea: true,
          placeholder: "Disabled when isOwner=false, only for admins",
        }),
      },
    ],
  })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      params: { targetField: "displayName", setDisabled: true },
      onParam: [
        { key: "fieldId", value: "isOwner" },
        { key: "value", value: true },
      ],
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      params: { targetField: "displayName", setDisabled: false },
      onParam: [
        { key: "fieldId", value: "isOwner" },
        { key: "value", value: false },
      ],
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      requirePermission: GROUPED_FORM_PERMISSION,
      params: { targetField: "adminNotes", setDisabled: true },
      onParam: [
        { key: "fieldId", value: "isOwner" },
        { key: "value", value: false },
      ],
    })
    .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
      requirePermission: GROUPED_FORM_PERMISSION,
      params: { targetField: "adminNotes", setDisabled: false },
      onParam: [
        { key: "fieldId", value: "isOwner" },
        { key: "value", value: true },
      ],
    })
    .watchFilter((permissions, watches, permissionId) => {
      console.log(
        `[watch-filter] ${permissionId}: ${watches.length} watch(es) after permission filtering (user has ${permissions.size} perm(s))`,
      );
      return watches;
    });
}
