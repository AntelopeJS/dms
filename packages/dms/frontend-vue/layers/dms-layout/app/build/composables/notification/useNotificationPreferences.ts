import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import { useInstantSave } from "#dms-ui/app/build/composables/instant-save/useInstantSave";
import {
  type NotificationCategory,
  type NotificationSubject,
  subjectPreferenceKey,
  useNotificationCatalog,
} from "./useNotificationCatalog";

type PreferenceMap = Record<string, boolean>;

const PREFERENCES_URL = "/settings/user/notifications/preferences";

/**
 * State of the notification preferences matrix. Each switch saves on its
 * own through the shared instant save (a PATCH of the keys it changes); a
 * failed save puts the switches back and keeps the change for a retry.
 */
export const useNotificationPreferences = () => {
  const { $authFetch } = useAuthFetch();
  const catalog = useNotificationCatalog();
  const preferences = ref<PreferenceMap>({});
  const isLoading = ref(true);
  const loadFailed = ref(false);

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

  const load = async () => {
    isLoading.value = true;
    loadFailed.value = false;
    try {
      const [stored] = await Promise.all([
        $authFetch<PreferenceMap>(PREFERENCES_URL),
        catalog.loadCatalog(),
      ]);
      preferences.value = stored ?? {};
      instant.confirm(preferences.value);
    } catch {
      loadFailed.value = true;
    } finally {
      isLoading.value = false;
    }
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
