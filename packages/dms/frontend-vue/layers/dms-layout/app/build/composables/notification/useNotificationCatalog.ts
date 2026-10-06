export type NotificationTogglePermission = "allowed" | "forbidden" | "default";

export interface NotificationCategory {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  icon: string;
  togglePermission?: NotificationTogglePermission;
  /** Short module tag (`SaaS`) shown on the category and its notifications. */
  tagKey?: string;
}

export interface NotificationSubject {
  id: string;
  category: NotificationCategory;
  labelKey: string;
  descriptionKey?: string;
  togglePermission?: NotificationTogglePermission;
  badgeKey?: string;
  /** Set by the server: the user may not turn the subject off. */
  locked?: boolean;
}

interface NotificationCatalogResponse {
  categories: NotificationCategory[];
  subjects: NotificationSubject[];
}

export const buildPreferenceKey = (categoryId: string, subjectId: string) =>
  `${categoryId}:${subjectId}`;

export const subjectPreferenceKey = (subject: NotificationSubject) =>
  buildPreferenceKey(subject.category.id, subject.id);

/**
 * The registered notification categories and subjects, loaded once and
 * shared by the preferences matrix and the inbox (which tags each
 * notification with its source).
 */
export const useNotificationCatalog = () => {
  const { $authFetch } = useAuthFetch();
  const categories = useDmsState<NotificationCategory[]>(
    "notification-catalog-categories",
    () => [],
  );
  const subjects = useDmsState<NotificationSubject[]>(
    "notification-catalog-subjects",
    () => [],
  );
  const isLoaded = useDmsState<boolean>(
    "notification-catalog-loaded",
    () => false,
  );

  const loadCatalog = async () => {
    const response = await $authFetch<NotificationCatalogResponse>(
      "/settings/user/notifications/categories",
    );
    categories.value = response.categories;
    subjects.value = response.subjects;
    isLoaded.value = true;
  };

  const subjectsOf = (categoryId: string) =>
    subjects.value.filter((subject) => subject.category.id === categoryId);

  const findCategory = (categoryId: string) =>
    categories.value.find((category) => category.id === categoryId);

  const findSubject = (categoryId: string, subjectId?: string) =>
    subjects.value.find(
      (subject) =>
        subject.category.id === categoryId && subject.id === subjectId,
    );

  return {
    categories,
    subjects,
    isLoaded,
    loadCatalog,
    subjectsOf,
    findCategory,
    findSubject,
  };
};
