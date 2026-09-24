import { NotificationBuilder } from "./builder";
import { internal } from "./internal";

export { internal };
import type {
  NotificationCategoryInfo,
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

// The built-in category and subjects are built here, so every module can point
// its notifications at them, but registered by the DMS module
// (`RegisterBuiltInNotifications`) rather than as a side effect of importing
// this package: an import-time registration belongs to whichever module
// imported the package first and dies with that module's generation. The DMS
// reloading then lost the "system" category, and registering any subject under
// it failed the reload.
export const SystemCategory: NotificationCategoryInfo = {
  id: "system",
  labelKey: "dms.notifications.categories.system",
  descriptionKey: "dms.notifications.categories.system_desc",
  icon: "i-ph-gear",
  togglePermission: "default",
};

export const GeneralSubject: NotificationSubjectInfo = {
  id: "general",
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.general",
  togglePermission: "forbidden",
};

export const SecuritySubject: NotificationSubjectInfo = {
  id: "security",
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.security",
  descriptionKey: "dms.notifications.subjects.security_desc",
  togglePermission: "default",
};

export const AccountSubject: NotificationSubjectInfo = {
  id: "account",
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.account",
  descriptionKey: "dms.notifications.subjects.account_desc",
  togglePermission: "default",
};

export const CollaborationSubject: NotificationSubjectInfo = {
  id: "collaboration",
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.collaboration",
  descriptionKey: "dms.notifications.subjects.collaboration_desc",
  togglePermission: "default",
};

export const AutomationSubject: NotificationSubjectInfo = {
  id: "automation",
  category: SystemCategory,
  labelKey: "dms.notifications.subjects.automation",
  descriptionKey: "dms.notifications.subjects.automation_desc",
  togglePermission: "default",
};

const BUILT_IN_SUBJECTS = [
  GeneralSubject,
  SecuritySubject,
  AccountSubject,
  CollaborationSubject,
  AutomationSubject,
];

/**
 * Registers the built-in "system" category and its subjects. Called by the DMS
 * module when it constructs, so they belong to it and come back with each of
 * its generations.
 *
 * @internal
 */
export function RegisterBuiltInNotifications(): void {
  internal.RegisterNotificationCategory.register(SystemCategory);
  for (const subject of BUILT_IN_SUBJECTS) {
    internal.RegisterNotificationSubject.register(subject);
  }
}
