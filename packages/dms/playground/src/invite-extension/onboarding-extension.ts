import { Logging } from "@antelopejs/interface-core/logging";
import { RegisterInviteExtension } from "@antelopejs/interface-dms/invite-extensions";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { z } from "zod";

const ONBOARDING_TRACKS = [
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "engineering", label: "Engineering" },
];

const onboardingSchema = z.object({
  track: z.enum(["sales", "support", "engineering"]),
  mentorNote: z.string().trim().max(200).optional(),
});

export type OnboardingPayload = z.infer<typeof onboardingSchema>;

/**
 * What the module derived from an accepted invitation, keyed by user id — the
 * only handle a member removal carries. A real module would persist this; here
 * it stands in for that state so the cleanup path has something to undo.
 */
export const onboardingAssignments = new Map<string, OnboardingPayload>();

/**
 * Stands in for a module that needs one more answer at invite time and acts on
 * it once the invitee joins — the invitation-side counterpart of the
 * `@RegisterPageExtension` demos next door.
 *
 * The two fields show up in the DMS invite modal, above the roles selector,
 * and the values come back to `onAccept` unprefixed.
 */
export const disposeOnboardingInviteExtension = RegisterInviteExtension({
  key: "onboarding",
  label: "Onboarding (playground)",
  description: "Attached to the invitation by the playground module",
  placement: { side: "before", anchorField: "roles" },
  component: Form({
    fields: [
      {
        id: "track",
        label: "Onboarding track",
        type: new DefaultDataTypes.SelectType({ items: ONBOARDING_TRACKS }),
        required: true,
        defaultValue: "sales",
      },
      {
        id: "mentorNote",
        label: "Note for the mentor",
        type: new DefaultDataTypes.StringType({
          placeholder: "Anything the mentor should know",
          maxLength: 200,
        }),
      },
    ],
  }),
  schema: onboardingSchema,
  onAccept: (payload, member, context) => {
    onboardingAssignments.set(member.userId, payload);
    Logging.Info(
      `[playground] onboarding track "${payload.track}" delivered for ${context.email} (member ${member._id})`,
    );
  },
  // An invitation that is cancelled or replaced never produced an assignment,
  // so only the member-removal branch has anything to drop; both are logged so
  // the playground shows the whole lifecycle.
  onCleanup: (payload, context) => {
    if (context.userId) {
      onboardingAssignments.delete(context.userId);
    }
    Logging.Info(
      `[playground] onboarding cleanup (${context.reason}) for ${context.email ?? context.userId}, track "${payload?.track ?? "none"}"`,
    );
  },
});
