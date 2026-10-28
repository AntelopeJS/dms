import type {
  NotificationCategoryInfo,
  NotificationSubjectInfo,
} from "@antelopejs/interface-dms/notifications/types";

export const categoryRegistry = new Map<string, NotificationCategoryInfo>();
export const subjectRegistry = new Map<string, NotificationSubjectInfo>();

export function getRegisteredCategories(): NotificationCategoryInfo[] {
  return Array.from(categoryRegistry.values());
}

export function getRegisteredSubjects(): NotificationSubjectInfo[] {
  return Array.from(subjectRegistry.values());
}

/** Category stances under which a subject's own `forbidden` locks its switch. */
const LOCKING_CATEGORY_PERMISSIONS: ReadonlySet<string | undefined> = new Set([
  "default",
  "forbidden",
]);

/**
 * Whether users are kept from turning a subject off: the subject declares
 * `forbidden` and its category `default` or `forbidden` (see the
 * categories-and-subjects guide).
 */
export function isSubjectLocked(subject: NotificationSubjectInfo): boolean {
  return (
    subject.togglePermission === "forbidden" &&
    LOCKING_CATEGORY_PERMISSIONS.has(subject.category.togglePermission)
  );
}

export function findSubjectByPreferenceKey(
  key: string,
): NotificationSubjectInfo | undefined {
  return subjectRegistry.get(key);
}
