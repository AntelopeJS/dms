import { useClipboard } from "@vueuse/core";
import type { CommandPaletteGroup, CommandPaletteItem } from "@nuxt/ui";

const SESSION_SOURCE_ID = "dms-session";
const SESSION_SOURCE_ORDER = 50;
const SESSION_GROUP_ID = "session";
const LANGUAGE_ICON = "i-ph-translate-light";
const COPY_URL_ICON = "i-ph-link-light";
const LOGOUT_ICON = "i-ph-sign-out-light";

interface LocaleOption {
  code: string;
  name?: string;
}

function uniqueByCode<T extends LocaleOption>(locales: T[]): T[] {
  const seen = new Set<string>();
  return locales.filter((locale) => {
    if (seen.has(locale.code)) return false;
    seen.add(locale.code);
    return true;
  });
}

function buildAccountItems(t: AppTranslation["t"]): CommandPaletteItem[] {
  return ACCOUNT_MENU_ENTRIES.map((entry) => ({
    label: t(entry.labelKey),
    icon: entry.icon,
    to: entry.to,
  }));
}

export default defineDmsPlugin(() => {
  const { $i18n: i18n } = useDmsApp();
  const { t } = getAppTranslation();
  const toast = useToast();
  const { logout } = useLogout();
  const { changeLanguage } = useUserLanguage();
  const { copy } = useClipboard({ legacy: true });

  const localeItems = (): CommandPaletteItem[] =>
    uniqueByCode(i18n.locales.value).map((locale) => ({
      label: locale.name ?? locale.code,
      active: i18n.locale.value === locale.code,
      onSelect: () => {
        void changeLanguage(locale.code);
      },
    }));

  async function copyCurrentUrl(): Promise<void> {
    try {
      await copy(window.location.href);
      toast.add({ title: t("commandPalette.session.urlCopied") });
    } catch {
      toast.add({
        title: t("commandPalette.session.copyFailed"),
        color: "error",
      });
    }
  }

  function buildSessionGroup(): CommandPaletteGroup {
    return {
      id: SESSION_GROUP_ID,
      label: t("commandPalette.groups.session"),
      items: [
        ...buildAccountItems(t),
        {
          label: t("commandPalette.session.changeLanguage"),
          icon: LANGUAGE_ICON,
          children: localeItems(),
        },
        {
          label: t("commandPalette.session.copyUrl"),
          icon: COPY_URL_ICON,
          onSelect: () => {
            void copyCurrentUrl();
          },
        },
        {
          label: t("button.logout"),
          icon: LOGOUT_ICON,
          onSelect: () => {
            void logout();
          },
        },
      ],
    };
  }

  const groups = computed<CommandPaletteGroup[]>(() => [buildSessionGroup()]);

  registerCommandPaletteSource({
    id: SESSION_SOURCE_ID,
    order: SESSION_SOURCE_ORDER,
    groups: () => groups.value,
  });
});
