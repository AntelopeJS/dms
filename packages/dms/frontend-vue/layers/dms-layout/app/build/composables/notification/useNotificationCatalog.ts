import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
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
  /** Set by the server when the subject has an e-mail switch: it offers e-mail and a module delivers it. */
  email?: {
    /** E-mail is on for a user who never chose. */
    defaultOn: boolean;
  };
}

interface NotificationCatalogResponse {
  categories: NotificationCategory[];
  subjects: NotificationSubject[];
  /** A module registered the e-mail channel. */
  emailChannel?: boolean;
}

export const buildPreferenceKey = (categoryId: string, subjectId: string) =>
  `${categoryId}:${subjectId}`;

export const subjectPreferenceKey = (subject: NotificationSubject) =>
  buildPreferenceKey(subject.category.id, subject.id);

/** The key the subject's e-mail switch is stored under. */
export const emailPreferenceKey = (subject: NotificationSubject) =>
  `${subjectPreferenceKey(subject)}@email`;

const CATALOG_URL = pageRoutePath(
  "/settings/user/notifications",
  "/categories",
);

/** Whether a read has answered with a failure, and no retry is running. */
export const hasFailed = (read: ApiDataResult<unknown>): boolean =>
  !!read.error.value && read.status.value !== "pending";

/**
 * The registered notification categories and subjects, read once with the
 * page and shared by the preferences matrix and the inbox (which tags each
 * notification with its source).
 *
 * @param enabled Whether the page shows them: nothing is read otherwise
 */
export const useNotificationCatalog = (enabled: () => boolean = () => true) => {
  const catalog = useApiData<NotificationCatalogResponse>(() =>
    enabled() ? CATALOG_URL : null,
  );
  const categories = computed(() => catalog.data.value?.categories ?? []);
  const subjects = computed(() => catalog.data.value?.subjects ?? []);
  /** A module registered the e-mail channel: its column holds switches. */
  const hasEmailChannel = computed(
    () => catalog.data.value?.emailChannel === true,
  );
  const isLoaded = computed(() => !!catalog.data.value);
  const loadFailed = computed(() => !isLoaded.value && hasFailed(catalog));

  /** Reads the catalog again (a retry). */
  const loadCatalog = (): Promise<void> => catalog.refresh({ dedupe: "defer" });

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
    hasEmailChannel,
    isLoaded,
    loadFailed,
    loadCatalog,
    subjectsOf,
    findCategory,
    findSubject,
  };
};
