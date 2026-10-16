import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import { useInstantSave } from "#dms-ui/app/build/composables/instant-save/useInstantSave";
import {
  hasFailed,
  type NotificationCategory,
  type NotificationSubject,
  subjectPreferenceKey,
  useNotificationCatalog,
} from "./useNotificationCatalog";

type PreferenceMap = Record<string, boolean>;

const PREFERENCES_URL = pageRoutePath(
  "/settings/user/notifications",
  "/preferences",
);

/**
 * State of the notification preferences matrix, read with the page (the
 * stored preferences and the catalog). Each switch saves on its own through
 * the shared instant save (a PATCH of the keys it changes); a failed save
 * puts the switches back and keeps the change for a retry.
 *
 * @param enabled Whether the page shows them: nothing is read otherwise
 */
export const useNotificationPreferences = (
  enabled: () => boolean = () => true,
) => {
  const { $authFetch } = useAuthFetch();
  const catalog = useNotificationCatalog(enabled);
  const stored = useApiData<PreferenceMap>(() =>
    enabled() ? PREFERENCES_URL : null,
  );
  // The switches edit the read's data in place.
  const preferences = computed<PreferenceMap>({
    get: () => stored.data.value ?? {},
    set: (value) => {
      stored.data.value = value;
    },
  });
  // A user who never changed a switch has no stored preferences (null).
  const isStoredRead = computed(
    () => stored.status.value === "success" || stored.data.value != null,
  );
  const loadFailed = computed(
    () => (!isStoredRead.value && hasFailed(stored)) || catalog.loadFailed.value,
  );
  const isLoading = computed(
    () =>
      !(isStoredRead.value && catalog.isLoaded.value) && !loadFailed.value,
  );

  const instant = useInstantSave<PreferenceMap>({
    read: (key) => preferences.value[key] ?? true,
    write: (key, enabled) => {
      preferences.value = { ...preferences.value, [key]: enabled };
    },
    save: (changes) =>
      $authFetch(PREFERENCES_URL, { method: "PATCH", body: changes }),
  });

  const isEnabled = (subject: NotificationSubject) =>
    preferences.value[subjectPreferenceKey(subject)] ?? true;

  const rowState = (subject: NotificationSubject): SaveStatusState =>
    instant.states[subjectPreferenceKey(subject)] ?? "idle";

  const toggleableSubjectsOf = (category: NotificationCategory) =>
    catalog.subjectsOf(category.id).filter((subject) => !subject.locked);

  const toggleSubject = (subject: NotificationSubject, enabled: boolean) =>
    instant.change(subjectPreferenceKey(subject), enabled);

  const toggleCategory = (category: NotificationCategory, enabled: boolean) =>
    instant.changeMany(
      Object.fromEntries(
        toggleableSubjectsOf(category).map((subject) => [
          subjectPreferenceKey(subject),
          enabled,
        ]),
      ),
    );

  /** Reads the preferences and the catalog again (a retry). */
  const load = async () => {
    await Promise.all([
      stored.refresh({ dedupe: "defer" }),
      catalog.loadCatalog(),
    ]);
    // A failed save then puts back what the server holds now.
    if (stored.status.value === "success") instant.confirm(preferences.value);
  };

  return {
    categories: catalog.categories,
    subjectsOf: catalog.subjectsOf,
    preferences,
    failedChanges: instant.failed,
    saveState: instant.state,
    isLoading,
    loadFailed,
    isEnabled,
    rowState,
    toggleableSubjectsOf,
    toggleSubject,
    toggleCategory,
    retry: instant.retry,
    load,
  };
};
