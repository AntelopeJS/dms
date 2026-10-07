// The roles field of the members table's edit form ("Change roles"), drawn as
// the role picker of the invite form. The data controller declares a plain
// roles relation; the page swaps in its picker through the form's slot, so
// the interface names no route or component of the DMS.

import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import type {
  FormFieldOrGroupSerialized,
  FormFieldSerialized,
} from "@antelopejs/interface-dms/base/form";
import {
  RegisterComponentSlot,
  type SlotOptions,
} from "@antelopejs/interface-dms/component-slots";
import { ROLES_PAGE_PATH } from "./member-invite-form";

/** Slot the members table opens on its edit form. */
export const MEMBER_EDIT_FORM_SLOT_ID = "dms.member-edit-form";

const ROLES_FIELD_ID = "roleIds";
/** Roles the "Change roles" form offers, a route of the members page. */
const MEMBER_ROLE_OPTIONS_URL = "/settings/workspace/members/role-options";

/** Where a roles picker of an edit form reads its roles, and its owner flag. */
export interface EditRolePickerOptions {
  /** Route answering the roles on offer (`InviteRoleOptions`). */
  rolesUrl: string;
  /** Boolean field of the same form making the holder an owner. */
  ownerField: string;
}

/**
 * The roles as pills, each with what it grants, like the invite form; inert
 * while the holder is an owner, and none is a valid choice. The form reads
 * `multiple` and `keyMapping` to load the roles as ids.
 */
export function editRolePicker({
  rolesUrl,
  ownerField,
}: EditRolePickerOptions) {
  return CustomComponent("DmsMemberRolePicker").options({
    multiple: true,
    keyMapping: { label: "name", value: "_id" },
    rolesUrl,
    rolesPageUrl: ROLES_PAGE_PATH,
    ownerField,
    allowEmpty: true,
  });
}

const ROLE_PICKER = editRolePicker({
  rolesUrl: MEMBER_ROLE_OPTIONS_URL,
  ownerField: "isTenantOwner",
}).serializeSync();

function withRolePicker(
  item: FormFieldOrGroupSerialized,
): FormFieldOrGroupSerialized {
  if ("fields" in item) {
    return {
      ...item,
      fields: item.fields.map((field) => withRolePicker(field)),
    } as FormFieldOrGroupSerialized;
  }
  return item.id === ROLES_FIELD_ID
    ? ({ ...item, component: ROLE_PICKER } as FormFieldSerialized)
    : item;
}

/** The edit form's options with the role picker on its roles field. */
export function withMemberRolePicker(options: SlotOptions): SlotOptions {
  const fields = options.fields as FormFieldOrGroupSerialized[] | undefined;
  if (!fields) return options;
  return { ...options, fields: fields.map(withRolePicker) };
}

RegisterComponentSlot(MEMBER_EDIT_FORM_SLOT_ID, withMemberRolePicker);
