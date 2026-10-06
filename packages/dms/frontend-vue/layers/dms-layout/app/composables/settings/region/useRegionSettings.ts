import { useInstantSave } from "#dms-ui/app/build/composables/instant-save/useInstantSave";
import type {
  DateFormatPreference,
  TimeFormatPreference,
  WeekStartPreference,
} from "#dms-core/app/utils/regional";
import { resolveFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { resolveApiMessage } from "#dms-core/app/composables/translation/useTranslation";

export const REGION_PREFERENCES_ENDPOINT = "/settings/user/region/preferences";
const REGION_FIELDS = [
  "language",
  "timeZone",
  "weekStart",
  "timeFormat",
  "dateFormat",
] as const;
const FIELD_CODES = {
  "error.invalid_time_zone": {
    field: "timeZone",
    message: "page.settings.region.invalid_time_zone",
  },
} as const;

/** What the Language & region page saves, as the API takes it. */
export interface RegionSettingsValues {
  language: string;
  timeZone: string | null;
  weekStart: WeekStartPreference | null;
  timeFormat: TimeFormatPreference | null;
  dateFormat: DateFormatPreference | null;
}

export type RegionSettingsField = keyof RegionSettingsValues;

type SessionUser = Partial<RegionSettingsValues> & Record<string, unknown>;

/**
 * Instant save of the Language & region page, through the shared instant
 * save: each control saves on its own, with its own state. The session user
 * is patched first, so dates across the dashboard follow before the request
 * returns, and put back if it fails: a refused value shows under its control
 * (`errors`), a failed request is a toast; either can be retried.
 */
export function useRegionSettings() {
  const dmsApp = useDmsApp();
  const { $authFetch } = useAuthFetch();
  const { user } = useUserSession<SessionUser>();
  const { refresh } = useCurrentUser();
  const toast = useToast();
  const { t } = useI18n();
  const errors = reactive<Partial<Record<RegionSettingsField, string>>>({});

  function showRefusal(error: unknown): void {
    const [refused] = resolveFieldErrors<RegionSettingsField>(error, {
      fields: REGION_FIELDS,
      codes: FIELD_CODES,
    }).fields;
    if (refused) {
      errors[refused.field as RegionSettingsField] = resolveApiMessage(
        (key, params) => t(key, params),
        refused.message,
      );
      return;
    }
    toast.add({
      color: "error",
      icon: "i-ph-warning-circle",
      title: t("page.settings.region.save_error"),
    });
  }

  const instant = useInstantSave<RegionSettingsValues>({
    read: (field) =>
      (user.value?.[field] ?? null) as RegionSettingsValues[typeof field],
    write: (field, value) => {
      if (user.value) user.value = { ...user.value, [field]: value };
      if (field === "language" && typeof value === "string") {
        void dmsApp.$i18n.setLocale(value);
      }
    },
    save: async (changes) => {
      await $authFetch(REGION_PREFERENCES_ENDPOINT, {
        method: "POST",
        body: changes,
      });
      await refresh().catch(() => undefined);
    },
    onError: showRefusal,
  });

  function save<K extends RegionSettingsField>(
    field: K,
    value: RegionSettingsValues[K],
  ): void {
    if ((user.value?.[field] ?? null) === value) return;
    delete errors[field];
    instant.change(field, value);
  }

  return {
    states: instant.states,
    state: instant.state,
    errors,
    save,
    retry: instant.retry,
  };
}
