import { z } from "zod";
import type {
  InviteCleanupContext,
  InviteExtensionOptions,
} from "@antelopejs/interface-dms/invite-extensions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormFieldOrGroupSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";

function textField(id: string, required = false) {
  return {
    id,
    label: id,
    type: new DefaultDataTypes.StringType({}),
    required,
  };
}

/** Stands in for the invite modal with its real slot and address field ids. */
export function inviteHostForm() {
  return Form({
    fields: [textField("emails", true), textField("roles")],
    slotId: "dms.invite-form",
  });
}

/** Stands in for the pending invitation edit form with its stored column names. */
export function inviteEditHostForm() {
  return Form({
    fields: [
      textField("email"),
      textField("firstname"),
      textField("roles_ids"),
    ],
    slotId: "dms.invite-edit-form",
  });
}

export function extensionForm(fieldId: string) {
  return Form({ fields: [textField(fieldId, true)] });
}

interface Recorded {
  accepted: Array<{
    payload: Parameters<InviteExtensionOptions<unknown>["onAccept"]>[0];
    member: Parameters<InviteExtensionOptions<unknown>["onAccept"]>[1];
  }>;
  cleaned: InviteCleanupContext[];
}

/** A contributor that records what it was handed, with a one-string payload. */
export function recordingExtension(key: string, fieldId = "note") {
  const recorded: Recorded = { accepted: [], cleaned: [] };
  const options: InviteExtensionOptions<{ [k: string]: string }> = {
    key,
    component: extensionForm(fieldId),
    schema: z.object({ [fieldId]: z.string().min(1) }),
    onAccept: (payload, member) => {
      recorded.accepted.push({ payload, member });
    },
    onCleanup: (_payload, context) => {
      recorded.cleaned.push(context);
    },
  };
  return { recorded, options };
}

export function fieldIds(fields: FormFieldOrGroupSerialized[]): string[] {
  return fields.flatMap((item) =>
    isFieldGroupSerialized(item)
      ? item.fields.map((field) => field.id)
      : [item.id],
  );
}

export function topLevelIds(fields: FormFieldOrGroupSerialized[]): string[] {
  return fields.map((item) => item.id);
}
