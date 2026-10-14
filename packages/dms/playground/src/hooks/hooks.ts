import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";
import { recordHookEvent } from "./log";

/** An invitation to an address of this domain is vetoed by the hook below. */
export const BLOCKED_INVITE_DOMAIN = "@blocked.test";

RegisterHook(Hook.DATABASE_INITIALIZED, () =>
  recordHookEvent({
    icon: "i-ph-database",
    title: Hook.DATABASE_INITIALIZED,
    detail: "Sticky hook: ran once the DMS settled it",
  }),
);

RegisterHook(Hook.INVITE_BEING_CREATED, ({ email }) => {
  if (!email.endsWith(BLOCKED_INVITE_DOMAIN)) return undefined;
  recordHookEvent({
    icon: "i-ph-prohibit",
    tone: "error",
    title: Hook.INVITE_BEING_CREATED,
    detail: `Vetoed the invitation of ${email}`,
  });
  throw new Error(`Invitations to ${BLOCKED_INVITE_DOMAIN} are blocked`);
});

RegisterHook(Hook.INVITE_CREATED, ({ email, roleIds }) =>
  recordHookEvent({
    icon: "i-ph-envelope-simple",
    tone: "primary",
    title: Hook.INVITE_CREATED,
    detail: `${email}, ${roleIds.length} role(s)`,
  }),
);

RegisterHook(Hook.INVITE_DELETED, ({ email, reason }) =>
  recordHookEvent({
    icon: "i-ph-envelope-simple-open",
    title: Hook.INVITE_DELETED,
    detail: `${email}: ${reason}`,
  }),
);

RegisterHook(Hook.MEMBER_ADDED, ({ userId, isTenantOwner }) =>
  recordHookEvent({
    icon: "i-ph-user-plus",
    tone: "success",
    title: Hook.MEMBER_ADDED,
    detail: `${userId}${isTenantOwner ? " (owner)" : ""}`,
  }),
);

RegisterHook(Hook.MEMBER_REMOVED, ({ userIds }) =>
  recordHookEvent({
    icon: "i-ph-user-minus",
    tone: "warning",
    title: Hook.MEMBER_REMOVED,
    detail: userIds.join(", "),
  }),
);

RegisterHook(Hook.USER_REGISTERED, ({ email }) =>
  recordHookEvent({
    icon: "i-ph-user-circle-plus",
    tone: "success",
    title: Hook.USER_REGISTERED,
    detail: email,
  }),
);
