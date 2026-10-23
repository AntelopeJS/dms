import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import {
  RegisterInviteAvailability,
  RegisterInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions";
import { z } from "zod";
import { recordHookEvent } from "./log";

const TEAMS = ["sales", "ops"] as const;

const onboardingSchema = z.object({ team: z.enum(TEAMS) });
type Onboarding = z.infer<typeof onboardingSchema>;

// Workspaces whose seats the hooks page marked as all taken.
const fullWorkspaces = new Set<string>();

export function toggleSeatsFull(tenantId: string): boolean {
  const full = !fullWorkspaces.has(tenantId);
  if (full) {
    fullWorkspaces.add(tenantId);
  } else {
    fullWorkspaces.delete(tenantId);
  }
  return full;
}

export function areSeatsFull(tenantId: string): boolean {
  return fullWorkspaces.has(tenantId);
}

// A field merged into the invite modal, after the email. Its payload rides
// along with the invitation and each step of its life is logged to the
// hooks feed.
RegisterInviteExtension<Onboarding>({
  key: "playground",
  label: "Playground onboarding",
  description: "Added by the playground's RegisterInviteExtension",
  component: Form({
    fields: [
      {
        id: "team",
        label: "Team",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Sales", value: "sales" },
            { label: "Ops", value: "ops" },
          ],
        }),
      },
    ],
  }),
  schema: onboardingSchema,
  placement: { side: "after", anchorField: "emails" },
  onAccept: (payload, _member, context) =>
    recordHookEvent({
      icon: "i-ph-puzzle-piece",
      tone: "success",
      title: "Invite extension: onAccept",
      detail: `${context.email} joins the ${payload.team} team`,
    }),
  onUpdate: (payload, previous, context) =>
    recordHookEvent({
      icon: "i-ph-puzzle-piece",
      title: "Invite extension: onUpdate",
      detail: `${context.email}: ${previous?.team ?? "none"} → ${payload.team}`,
    }),
  onCleanup: (_payload, context) =>
    recordHookEvent({
      icon: "i-ph-puzzle-piece",
      tone: "warning",
      title: "Invite extension: onCleanup",
      detail: `${context.email ?? context.userId ?? ""}: ${context.reason}`,
    }),
});

// Disables the invite button of the members pages with a reason while the
// hooks page marks the seats as taken.
RegisterInviteAvailability(({ tenantId }) =>
  areSeatsFull(tenantId)
    ? { reason: "$demo.pages.hooks.seats_full" }
    : undefined,
);
