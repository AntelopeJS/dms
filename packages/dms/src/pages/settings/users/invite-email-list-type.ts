import { z } from "zod";
import {
  DataType,
  RegisterDataType,
} from "@antelopejs/interface-dms/base/data-types/core";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { INVITE_EMAILS_MAX } from "../../../validation/member-invite.schema";

export interface InviteEmailListOptions extends Record<string, unknown> {
  placeholder?: string;
  max?: number;
}

/**
 * The addresses of an invite request, typed or pasted as a list of tags. Only
 * the invite form uses it: it is not meant as a table column.
 */
@RegisterDataType("invite_email_list")
export class InviteEmailListType extends DataType {
  constructor(public readonly options: InviteEmailListOptions = {}) {
    super([], undefined, { max: INVITE_EMAILS_MAX, ...options });
  }

  protected defaultInputComponent() {
    return CustomComponent("DmsInviteEmailsInput")
      .options({ max: INVITE_EMAILS_MAX, ...this.options })
      .serializeSync();
  }

  getValidation() {
    return z.array(z.string().email()).min(1).max(INVITE_EMAILS_MAX);
  }
}
