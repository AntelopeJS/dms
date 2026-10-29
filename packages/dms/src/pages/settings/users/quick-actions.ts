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
