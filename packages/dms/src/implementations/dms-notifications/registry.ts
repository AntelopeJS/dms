import type {
  NotificationCategoryInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";

// The registries sit on their own so a database model can read them without
// importing this module's index, which reaches the db and utils barrels and
// closes a cycle back onto that model.

export const categoryRegistry = new Map<string, NotificationCategoryInfo>();
export const subjectRegistry = new Map<string, NotificationSubjectInfo>();

export function getRegisteredCategories(): NotificationCategoryInfo[] {
  return Array.from(categoryRegistry.values());
}

export function getRegisteredSubjects(): NotificationSubjectInfo[] {
  return Array.from(subjectRegistry.values());
}

export function isSubjectRegistered(
  categoryId: string,
  subjectId: string,
): boolean {
  return subjectRegistry.has(`${categoryId}:${subjectId}`);
}
