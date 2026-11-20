import { NotificationBuilder } from "./builder";
import { internal } from "./internal";

export { internal };
export * from "./types";
import type {
  NotificationCategoryInfo,
  NotificationEmailChannelInfo,
  NotificationSubjectInfo,
} from "./types";

export function Notification(): NotificationBuilder {
  return new NotificationBuilder();
}

export function NotificationCategory(
  id: string,
  category: Omit<NotificationCategoryInfo, "id">,
) {
  const notificationCategory: NotificationCategoryInfo = {
    id,
    ...category,
  };
  internal.RegisterNotificationCategory.register(notificationCategory);
  return notificationCategory;
}

export function NotificationSubject(
  id: string,
  subject: Omit<NotificationSubjectInfo, "id">,
) {
  const notificationSubject: NotificationSubjectInfo = {
    id,
    ...subject,
  };
  internal.RegisterNotificationSubject.register(notificationSubject);
  return notificationSubject;
}

/**
 * Registers the e-mail channel: every notification stored in a user's feed is
 * also handed to `deliver` when its subject offers e-mail and the user has it
 * on. One module registers it; a later registration replaces the earlier one.
 * The registration goes away with the module that made it.
 */
export function NotificationEmailChannel(
  channel: NotificationEmailChannelInfo,
): NotificationEmailChannelInfo {
  internal.emailChannelIdentity.stamp(channel);
  internal.RegisterNotificationEmailChannel.register(channel);
  return channel;
}

export const SystemCategory = NotificationCategory("system", {
  labelKey: "dms.notifications.categories.system",
  descriptionKey: "dms.notifications.categories.system_desc",
  icon: "i-ph-gear",
  togglePermission: "default",
});

export const GeneralSubject = NotificationSubject("general", {
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.general",
  descriptionKey: "dms.notifications.subjects.general_desc",
  togglePermission: "forbidden",
});

export const SecuritySubject = NotificationSubject("security", {
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.security",
  descriptionKey: "dms.notifications.subjects.security_desc",
  togglePermission: "default",
});

export const AccountSubject = NotificationSubject("account", {
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.account",
  descriptionKey: "dms.notifications.subjects.account_desc",
  togglePermission: "default",
});

export const CollaborationSubject = NotificationSubject("collaboration", {
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.collaboration",
  descriptionKey: "dms.notifications.subjects.collaboration_desc",
  togglePermission: "default",
});

export const AutomationSubject = NotificationSubject("automation", {
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.automation",
  descriptionKey: "dms.notifications.subjects.automation_desc",
  togglePermission: "default",
});
