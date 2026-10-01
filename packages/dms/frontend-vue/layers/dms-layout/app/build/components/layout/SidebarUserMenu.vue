<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

interface Props {
  collapsed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
});

const LOGOUT_ICON = "i-ph-sign-out-light";
const TRIGGER_ICON = "i-ph-caret-up-down-light";
const THEME_ICON = "i-ph-circle-half-light";
const LANGUAGE_ICON = "i-ph-translate-light";

interface ColorModeEntry {
  value: ColorModePreference;
  labelKey: string;
}

const COLOR_MODE_ENTRIES: ColorModeEntry[] = [
  { value: "system", labelKey: "page.settings.appearance.system" },
  { value: "light", labelKey: "page.settings.appearance.light" },
  { value: "dark", labelKey: "page.settings.appearance.dark" },
];

const { t, locale } = useI18n();
const { user } = useCurrentUser();
const { logout } = useLogout();
const colorModePreference = useColorModePreference();
const { uniqueLocales } = useUniqueLocales();
const { changeLanguage } = useUserLanguage();

// v2 user menu: account links, then the per-user preferences as submenus,
// then logging out.
const preferenceItems = computed<DropdownMenuItem[]>(() => [
  {
    label: t("page.settings.appearance.theme_title"),
    icon: THEME_ICON,
    children: COLOR_MODE_ENTRIES.map((entry) => ({
      label: t(entry.labelKey),
      type: "checkbox" as const,
      checked: colorModePreference.value === entry.value,
      onSelect: () => {
        colorModePreference.value = entry.value;
      },
    })),
  },
  {
    label: t("page.settings.overview.language"),
    icon: LANGUAGE_ICON,
    children: uniqueLocales.value.map((language) => ({
      label: language.name,
      type: "checkbox" as const,
      checked: locale.value === language.code,
      onSelect: () => {
        void changeLanguage(language.code);
      },
    })),
  },
]);

const menuItems = computed<DropdownMenuItem[][]>(() => [
  ACCOUNT_MENU_ENTRIES.map((entry) => ({
    label: t(entry.labelKey),
    icon: entry.icon,
    to: entry.to,
  })),
  preferenceItems.value,
  [
    {
      label: t("button.logout"),
      icon: LOGOUT_ICON,
      color: "error",
      onSelect: () => {
        void logout();
      },
    },
  ],
]);
</script>

<template>
  <UDropdownMenu
    :items="menuItems"
    :content="{ side: 'top', align: 'start', sideOffset: 6 }"
    :ui="{ content: 'w-56' }"
  >
    <button
      type="button"
      class="hover:bg-elevated data-[state=open]:bg-elevated flex w-full items-center gap-2.5 rounded-md p-1.5 text-start transition-colors"
      :class="{ 'justify-center': props.collapsed }"
      :aria-label="user?.name"
    >
      <UAvatar
        :alt="user?.name"
        size="sm"
        :ui="{
          root: 'bg-linear-135 from-(--ui-color-primary-400) to-(--ui-color-secondary-400)',
          fallback:
            'font-mono text-[11px] font-bold text-(--dms-accent-on-fill)',
        }"
      />
      <template v-if="!props.collapsed">
        <span class="flex min-w-0 flex-1 flex-col">
          <span
            class="text-highlighted truncate text-[13px] leading-tight font-semibold"
          >
            {{ user?.name }}
          </span>
          <span class="text-muted truncate font-mono text-[11px] font-medium">
            {{ user?.email }}
          </span>
        </span>
        <UIcon :name="TRIGGER_ICON" class="text-dimmed size-4 shrink-0" />
      </template>
    </button>

    <template #content-top>
      <div
        class="border-default flex items-center gap-2.5 border-b px-2.5 py-2.5"
      >
        <UAvatar
          :alt="user?.name"
          size="md"
          :ui="{
            root: 'bg-linear-135 from-(--ui-color-primary-400) to-(--ui-color-secondary-400)',
            fallback: 'font-mono text-xs font-bold text-(--dms-accent-on-fill)',
          }"
        />
        <div class="min-w-0">
          <div class="text-highlighted truncate text-[13px] font-semibold">
            {{ user?.name }}
          </div>
          <div class="text-muted truncate font-mono text-[11px]">
            {{ user?.email }}
          </div>
        </div>
      </div>
    </template>
  </UDropdownMenu>
</template>
