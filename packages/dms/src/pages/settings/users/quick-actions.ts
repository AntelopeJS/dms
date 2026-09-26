import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import { MEMBER_INVITE_BUTTON_ID, MembersSettingsController } from "./members";

const membersQuickActions = QuickActionCategory("dms-members", {
  displayName: "$quickActions.category_members",
  icon: "i-ph-users-three",
  order: 50,
});

// Presses the members table's invite button rather than opening its creation
// form, which the table does not offer: the action opens the invite form
// directly and is listed only for callers the button itself is shown to.
export const inviteMemberQuickAction = QuickAction("dms-invite-member", {
  category: membersQuickActions,
  displayName: "$quickActions.invite_member",
  icon: "i-ph-user-plus",
  order: 10,
  target: {
    type: "button",
    page: MembersSettingsController,
    button: MEMBER_INVITE_BUTTON_ID,
  },
});
