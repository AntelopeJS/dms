import type { SaveStatusState } from "#dms-ui/app/components/save-bar/SaveStatus.vue";
import type {
  DateFormatPreference,
  TimeFormatPreference,
  WeekStartPreference,
} from "#dms-core/app/utils/regional";

export const REGION_PREFERENCES_ENDPOINT = "/settings/user/region/preferences";
const SAVED_STAMP_MS = 2500;

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
 * Instant save of the Language & region page: each control saves on its own,
 * with its own "Saved" stamp. The session user is patched first, so dates
 * across the dashboard follow before the request returns, and put back if
 * it fails.
 */
export function useRegionSettings() {
  const dmsApp = useDmsApp();
  const { $authFetch } = useAuthFetch();
  const { user } = useUserSession<SessionUser>();
  const { refresh } = useCurrentUser();
  const toast = useToast();
  const { t } = useI18n();

  const states = reactive<
    Partial<Record<RegionSettingsField, SaveStatusState>>
  >({});
  const timers = new Map<RegionSettingsField, ReturnType<typeof setTimeout>>();

  function stamp(field: RegionSettingsField, state: SaveStatusState): void {
    clearTimeout(timers.get(field));
    states[field] = state;
    if (state !== "saved") return;
    timers.set(
      field,
      setTimeout(() => (states[field] = "idle"), SAVED_STAMP_MS),
    );
  }

  function patchUser(values: Partial<RegionSettingsValues>): void {
    if (user.value) user.value = { ...user.value, ...values };
  }

  async function save<K extends RegionSettingsField>(
    field: K,
    value: RegionSettingsValues[K],
  ): Promise<void> {
    const previous = user.value?.[field] ?? null;
    if (previous === value) return;
    stamp(field, "saving");
    patchUser({ [field]: value });
    if (field === "language") await dmsApp.$i18n.setLocale(value as string);
    try {
      await $authFetch(REGION_PREFERENCES_ENDPOINT, {
        method: "POST",
        body: { [field]: value },
      });
      stamp(field, "saved");
      await refresh().catch(() => undefined);
    } catch {
      patchUser({ [field]: previous });
      if (field === "language" && typeof previous === "string") {
        await dmsApp.$i18n.setLocale(previous);
      }
      stamp(field, "idle");
      toast.add({
        color: "error",
        icon: "i-ph-warning-circle",
        title: t("page.settings.region.save_error"),
      });
    }
  }

  onBeforeUnmount(() => timers.forEach((timer) => clearTimeout(timer)));

  return { states, save };
}
