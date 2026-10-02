import {
  type NotificationCategory,
  type NotificationSubject,
  subjectPreferenceKey,
  useNotificationCatalog,
} from "./useNotificationCatalog";

/** Instant-save feedback of one matrix row. */
export type PreferenceRowState = "idle" | "saving" | "saved";

type PreferenceMap = Record<string, boolean>;

const PREFERENCES_URL = "/settings/user/notifications/preferences";
/** How long a row keeps its "Saved" tick. */
const SAVED_STATE_DURATION_MS = 2000;

/**
 * State of the notification preferences matrix. Each switch saves on its
 * own (PATCH of the keys it changes); a failed save puts the switches back
 * and keeps the attempted change so it can be retried.
 */
export const useNotificationPreferences = () => {
  const { $authFetch } = useAuthFetch();
  const catalog = useNotificationCatalog();
  const preferences = ref<PreferenceMap>({});
  const rowStates = ref<Record<string, PreferenceRowState>>({});
  const failedChanges = ref<PreferenceMap | null>(null);
  const isLoading = ref(true);
  const loadFailed = ref(false);
  const savedTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const isEnabled = (subject: NotificationSubject) =>
    preferences.value[subjectPreferenceKey(subject)] ?? true;

  const rowState = (subject: NotificationSubject): PreferenceRowState =>
    rowStates.value[subjectPreferenceKey(subject)] ?? "idle";

  const toggleableSubjectsOf = (category: NotificationCategory) =>
    catalog.subjectsOf(category.id).filter((subject) => !subject.locked);

  const setRowStates = (keys: string[], state: PreferenceRowState) => {
    const next = { ...rowStates.value };
    for (const key of keys) {
      clearTimeout(savedTimers.get(key));
      next[key] = state;
    }
    rowStates.value = next;
  };

  const markSaved = (keys: string[]) => {
    setRowStates(keys, "saved");
    for (const key of keys) {
      savedTimers.set(
        key,
        setTimeout(() => setRowStates([key], "idle"), SAVED_STATE_DURATION_MS),
      );
    }
  };

  const save = async (changes: PreferenceMap) => {
    const keys = Object.keys(changes);
    if (keys.length === 0) return;
    const previous = Object.fromEntries(
      keys.map((key) => [key, preferences.value[key] ?? true]),
    );
    failedChanges.value = null;
    preferences.value = { ...preferences.value, ...changes };
    setRowStates(keys, "saving");
    try {
      await $authFetch(PREFERENCES_URL, { method: "PATCH", body: changes });
      markSaved(keys);
    } catch {
      preferences.value = { ...preferences.value, ...previous };
      setRowStates(keys, "idle");
      failedChanges.value = changes;
    }
  };

  const toggleSubject = (subject: NotificationSubject, enabled: boolean) =>
    save({ [subjectPreferenceKey(subject)]: enabled });

  const toggleCategory = (category: NotificationCategory, enabled: boolean) =>
    save(
      Object.fromEntries(
        toggleableSubjectsOf(category).map((subject) => [
          subjectPreferenceKey(subject),
          enabled,
        ]),
      ),
    );

  const retry = async () => {
    if (failedChanges.value) await save(failedChanges.value);
  };

  const load = async () => {
    isLoading.value = true;
    loadFailed.value = false;
    try {
      const [stored] = await Promise.all([
        $authFetch<PreferenceMap>(PREFERENCES_URL),
        catalog.loadCatalog(),
      ]);
      preferences.value = stored ?? {};
    } catch {
      loadFailed.value = true;
    } finally {
      isLoading.value = false;
    }
  };

  onBeforeUnmount(() => {
    for (const timer of savedTimers.values()) clearTimeout(timer);
  });

  return {
    categories: catalog.categories,
    subjectsOf: catalog.subjectsOf,
    preferences,
    failedChanges,
    isLoading,
    loadFailed,
    isEnabled,
    rowState,
    toggleableSubjectsOf,
    toggleSubject,
    toggleCategory,
    retry,
    load,
  };
};
