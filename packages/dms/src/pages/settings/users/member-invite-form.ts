import { roleSettingDataAPI } from "@antelopejs/interface-dms/data-controllers/roles";
import { INVITE_FORM_SLOT_ID } from "@antelopejs/interface-dms/invite-extensions";
import {
  Form,
  FormEvents,
  FormFunctions,
  HttpMethod,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { INVITE_NAME_MAX_LENGTH } from "../../../validation/member-invite.schema";

export const inviteLanguageSelectItems = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

function nameRequirementWatch(targetField: string, setRequired: boolean) {
  return {
    params: { targetField, setRequired },
    onParam: [
      { key: "fieldId", value: "skipEmailValidation" },
      { key: "value", value: setRequired },
    ],
  };
}

export const memberInviteForm = Form({
  fields: [
    {
      id: "email",
      label: "$page.settings.members.invite.field.email",
      type: new DefaultDataTypes.EmailType({
        placeholder: "$page.settings.members.invite.placeholder.email",
      }),
      required: true,
    },
    {
      id: "firstname",
      label: "$page.settings.members.invite.field.firstname",
      description: "$page.settings.members.invite.field.name_description",
      type: new DefaultDataTypes.StringType({
        placeholder: "$page.settings.members.invite.placeholder.firstname",
        maxLength: INVITE_NAME_MAX_LENGTH,
      }),
      required: false,
    },
    {
      id: "lastname",
      label: "$page.settings.members.invite.field.lastname",
      description: "$page.settings.members.invite.field.name_description",
      type: new DefaultDataTypes.StringType({
        placeholder: "$page.settings.members.invite.placeholder.lastname",
        maxLength: INVITE_NAME_MAX_LENGTH,
      }),
      required: false,
    },
    {
      id: "roles",
      label: "$page.settings.members.invite.field.roles",
      description: "$page.settings.members.invite.field.roles_description",
      type: new DefaultDataTypes.RelationType({
        multiple: true,
        placeholder: "$page.settings.members.invite.placeholder.roles",
        dataApiController: roleSettingDataAPI,
        keyMapping: {
          label: "name",
          value: "_id",
        },
      }),
      required: true,
    },
    {
      id: "language",
      label: "$page.settings.members.invite.field.language",
      type: new DefaultDataTypes.SelectType({
        items: inviteLanguageSelectItems,
      }),
      required: true,
      defaultValue: "en",
    },
    {
      id: "asTenantOwner",
      label: "$page.settings.members.invite.field.tenant_owner",
      description:
        "$page.settings.members.invite.field.tenant_owner_description",
      type: new DefaultDataTypes.BooleanType(),
      required: true,
      defaultValue: false,
    },
    {
      id: "skipEmailValidation",
      label: "$page.settings.members.invite.field.skip_email_validation",
      description:
        "$page.settings.members.invite.field.skip_email_validation_description",
      type: new DefaultDataTypes.BooleanType(),
      required: false,
      defaultValue: false,
    },
  ],
  fieldsOrientation: "vertical",
  // Modules attach their own fields here through `RegisterInviteExtension`.
  slotId: INVITE_FORM_SLOT_ID,
  submitUrl: "/settings/user/members/invite",
  submitUrlMethod: HttpMethod.post,
  submitLabel: "$page.settings.members.invite.submit",
  successMessage: "$page.settings.members.invite.success",
  // Resolved from the invite response: pending invites vs a directly-added
  // existing user land on different pages.
  redirectOnSuccess: "{{response.redirectPath}}",
})
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
    params: {
      targetField: "roles",
      setHidden: true,
    },
    onParam: [
      { key: "fieldId", value: "asTenantOwner" },
      { key: "value", value: true },
    ],
  })
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_HIDDEN, {
    params: {
      targetField: "roles",
      setHidden: false,
    },
    onParam: [
      { key: "fieldId", value: "asTenantOwner" },
      { key: "value", value: false },
    ],
  })
  .watch(
    FormEvents.FIELD_CHANGE,
    FormFunctions.SET_FIELD_REQUIRED,
    nameRequirementWatch("firstname", true),
  )
  .watch(
    FormEvents.FIELD_CHANGE,
    FormFunctions.SET_FIELD_REQUIRED,
    nameRequirementWatch("firstname", false),
  )
  .watch(
    FormEvents.FIELD_CHANGE,
    FormFunctions.SET_FIELD_REQUIRED,
    nameRequirementWatch("lastname", true),
  )
  .watch(
    FormEvents.FIELD_CHANGE,
    FormFunctions.SET_FIELD_REQUIRED,
    nameRequirementWatch("lastname", false),
  );
