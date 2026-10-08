import { roleSettingDataAPI } from "@antelopejs/interface-dms/data-controllers/roles";
import { INVITE_FORM_SLOT_ID } from "@antelopejs/interface-dms/invite-extensions/internal/form-slot";
import {
  Form,
  FormEvents,
  FormFunctions,
  HttpMethod,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  INVITE_EMAILS_MAX,
  INVITE_FULL_NAME_MAX_LENGTH,
} from "../../../validation/member-invite.schema";
import { DASHBOARD_LANGUAGE_ITEMS } from "./dashboard-languages";

const DEFAULT_INVITE_LANGUAGE = "en";

export const INVITE_DEFAULTS_URL =
  "/settings/workspace/members/invite/defaults";
export const INVITE_ROLES_URL = "/settings/workspace/members/invite/roles";
export const ROLES_PAGE_PATH = "/settings/workspace/roles";

export interface InviteFormDefaults {
  language: string;
}

/**
 * The invitation language offered first: the inviter's own UI language, which
 * is most often the one the team works in. The DMS keeps no per-workspace
 * locale to prefer over it.
 */
export function resolveInviteLanguage(language: string | undefined): string {
  const code = language?.slice(0, 2);
  const isOffered = DASHBOARD_LANGUAGE_ITEMS.some(
    (item) => item.value === code,
  );
  return code && isOffered ? code : DEFAULT_INVITE_LANGUAGE;
}

function whenFieldIs(fieldId: string, value: boolean) {
  return [
    { key: "fieldId", value: fieldId },
    { key: "value", value },
  ];
}

export const memberInviteForm = Form({
  kind: "action",
  fields: [
    {
      id: "emails",
      label: "$page.settings.members.invite.field.emails",
      description: "$page.settings.members.invite.field.emails_description",
      // Typed or pasted as tags; an address already a member comes back as
      // a server error naming it, and its tag turns red.
      type: new DefaultDataTypes.TagsType({
        itemType: "email",
        max: INVITE_EMAILS_MAX,
        placeholder: "$page.settings.members.invite.placeholder.emails",
      }),
      required: true,
    },
    {
      id: "roles",
      label: "$page.settings.members.invite.field.roles",
      type: new DefaultDataTypes.RelationType({
        multiple: true,
        dataApiController: roleSettingDataAPI,
        keyMapping: { label: "name", value: "_id" },
      }),
      // Pills with each role's permission count instead of a relation picker:
      // the inviter compares roles while choosing them. Inert while the
      // invitee is made an owner, as on the "Change roles" form.
      inputComponent: CustomComponent("DmsMemberRolePicker")
        .options({
          rolesUrl: INVITE_ROLES_URL,
          rolesPageUrl: ROLES_PAGE_PATH,
          ownerField: "asTenantOwner",
        })
        .serializeSync(),
      // Required unless the invitee is made an owner (see the watchers).
      required: false,
    },
    {
      id: "language",
      label: "$page.settings.members.invite.field.language",
      description: "$page.settings.members.invite.field.language_description",
      type: new DefaultDataTypes.SelectType({
        items: DASHBOARD_LANGUAGE_ITEMS,
      }),
      required: true,
      // Until the inviter's own language arrives from `fetchUrl`.
      defaultValue: DEFAULT_INVITE_LANGUAGE,
    },
    {
      id: "name",
      label: "$page.settings.members.invite.field.name",
      description: "$page.settings.members.invite.field.name_description",
      type: new DefaultDataTypes.StringType({
        placeholder: "$page.settings.members.invite.placeholder.name",
        maxLength: INVITE_FULL_NAME_MAX_LENGTH,
      }),
      required: false,
    },
    {
      id: "asTenantOwner",
      // A card with its own title and explanation, as the owner role
      // deserves more than a bare switch.
      type: new DefaultDataTypes.BooleanType({
        display: "card",
        icon: "i-ph-crown",
        label: "$page.settings.members.invite.field.tenant_owner",
        description:
          "$page.settings.members.invite.field.tenant_owner_description",
      }),
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
  fetchUrl: INVITE_DEFAULTS_URL,
  submitUrl: "/settings/workspace/members/invite",
  submitUrlMethod: HttpMethod.post,
  submitLabel: "$page.settings.members.invite.submit",
  successMessage: "$page.settings.members.invite.success",
  // Resolved from the invite response: pending invites vs directly-added
  // existing users land on different pages.
  redirectOnSuccess: "{{response.redirectPath}}",
})
  // Owners hold every permission: no role is asked of them. The picker greys
  // the roles itself (`ownerField`), as disabling the field would swap it for
  // a read-only display of the role ids.
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
    params: { targetField: "roles", setRequired: false },
    onParam: whenFieldIs("asTenantOwner", true),
  })
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
    params: { targetField: "roles", setRequired: true },
    onParam: whenFieldIs("asTenantOwner", false),
  })
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
    params: { targetField: "name", setRequired: true },
    onParam: whenFieldIs("skipEmailValidation", true),
  })
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_REQUIRED, {
    params: { targetField: "name", setRequired: false },
    onParam: whenFieldIs("skipEmailValidation", false),
  });
