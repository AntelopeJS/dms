import { pageRoutePath } from "#dms-core/app/utils/pageRoutes";
import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import { useInstantSave } from "#dms-ui/app/entries/composables/instant-save/useInstantSave";
import { combineSaveStates } from "#dms-ui/app/composables/layout/useInstantSaveHeader";
import {
  emailPreferenceKey,
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
 * `isEmailEnabled` answers as the server sends: a locked subject is mailed
 * whatever is stored, and a subject off in the app is not mailed at all.
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

  const preferences = computed<PreferenceMap>({
    get: () => stored.data.value ?? {},
    set: (value) => {
      stored.data.value = value;
    },
  });

  const isStoredRead = computed(
    () => stored.status.value === "success" || stored.data.value != null,
  );
  const loadFailed = computed(
    () =>
      (!isStoredRead.value && hasFailed(stored)) || catalog.loadFailed.value,
  );
  const isLoading = computed(
    () => !(isStoredRead.value && catalog.isLoaded.value) && !loadFailed.value,
  );

  const emailDefaults = computed<PreferenceMap>(() =>
    Object.fromEntries(
      catalog.subjects.value.flatMap((subject) =>
        subject.email
          ? [[emailPreferenceKey(subject), subject.email.defaultOn]]
          : [],
      ),
    ),
  );

  const read = (key: string) =>
    preferences.value[key] ?? emailDefaults.value[key] ?? true;

  const instant = useInstantSave<PreferenceMap>({
    read,
    write: (key, enabled) => {
      const { [key]: _stored, ...others } = preferences.value;
      preferences.value =
        enabled === undefined ? others : { ...others, [key]: enabled };
    },
    save: (changes) =>
      $authFetch(PREFERENCES_URL, { method: "PATCH", body: changes }),
  });

  const isEnabled = (subject: NotificationSubject) =>
    read(subjectPreferenceKey(subject));

  const isEmailEnabled = (subject: NotificationSubject) =>
    subject.locked === true ||
    (isEnabled(subject) && read(emailPreferenceKey(subject)));

  const rowState = (subject: NotificationSubject): SaveStatusState =>
    combineSaveStates([
      instant.states[subjectPreferenceKey(subject)],
      instant.states[emailPreferenceKey(subject)],
    ]);

  const toggleableSubjectsOf = (category: NotificationCategory) =>
    catalog.subjectsOf(category.id).filter((subject) => !subject.locked);

  const toggleSubject = (subject: NotificationSubject, enabled: boolean) =>
    instant.change(subjectPreferenceKey(subject), enabled);

  const toggleEmail = (subject: NotificationSubject, enabled: boolean) =>
    instant.change(emailPreferenceKey(subject), enabled);

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
    await Promise.all([
      stored.refresh({ dedupe: "defer" }),
      catalog.loadCatalog(),
    ]);

    if (stored.status.value === "success") instant.confirm(preferences.value);
  };

  return {
    categories: catalog.categories,
    subjectsOf: catalog.subjectsOf,
    hasEmailChannel: catalog.hasEmailChannel,
    isEmailEnabled,
    toggleEmail,
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
