import {
  QuickAction,
  QuickActionCategory,
} from "@antelopejs/interface-dms/quick-actions";
import { MembersSettingsController } from "./members";

const membersQuickActions = QuickActionCategory("dms-members", {
  displayName: "$quickActions.category_members",
  icon: "i-ph-users-three",
  order: 50,
});

// Navigates rather than opening a form: the invite form is a toolbar button of
// the members table, not its creation form. Access follows the members page.
export const inviteMemberQuickAction = QuickAction("dms-invite-member", {
  category: membersQuickActions,
  displayName: "$quickActions.invite_member",
  icon: "i-ph-user-plus",
  order: 10,
  target: { type: "navigate", page: MembersSettingsController },
});
