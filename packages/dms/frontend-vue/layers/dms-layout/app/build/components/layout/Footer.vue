<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";

const EXTERNAL_LINK_PATTERN = /^https?:\/\//;
const DEFAULT_COPYRIGHT = "Antelope";

const { locale, setLocale, t } = useI18n();
const { loggedIn: isLoggedIn } = useDmsUserSession();
const { changeLanguage } = useUserLanguage();
const { uniqueLocales } = useUniqueLocales();
const { links } = useFooterLinks();
const { processI18n } = useTranslation();
const footer = computed(() => useDmsAppConfig().branding.footer ?? {});
const copyright = computed(() =>
  footer.value.copyright === false
    ? null
    : processI18n(footer.value.copyright ?? DEFAULT_COPYRIGHT),
);
const showsLocaleSwitcher = computed(
  () => footer.value.localeSwitcher !== false,
);

const localesOptions: SelectItem[] = uniqueLocales.value.map((lang) => ({
  label: lang.name,
  value: lang.code,
}));

function isExternal(to: string): boolean {
  return EXTERNAL_LINK_PATTERN.test(to);
}

async function onLocaleChange(code: Parameters<typeof changeLanguage>[0]) {
  if (isLoggedIn.value) {
    await changeLanguage(code);
    return;
  }
  await setLocale(code);
}
</script>

<template>
  <!-- v2 .au-foot: one quiet 12.5px row, the locale switcher pushed right.
       On phones the links get a taller invisible hit area, so each stays
       easy to tap. -->
  <footer
    class="border-default text-dimmed flex flex-wrap items-center gap-x-[18px] gap-y-1.5 border-t px-5 py-3 text-[12.5px] max-sm:justify-center"
  >
    <span v-if="copyright">&copy; {{ copyright }}</span>
    <template v-for="link in links" :key="link.id">
      <a
        v-if="isExternal(link.to)"
        :href="link.to"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-highlighted transition-colors max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-1.5 max-sm:after:content-['']"
      >
        {{ t(link.label) }}
      </a>
      <DmsLink
        v-else
        :to="link.to"
        class="hover:text-highlighted transition-colors max-sm:relative max-sm:after:absolute max-sm:after:-inset-x-1 max-sm:after:-inset-y-1.5 max-sm:after:content-['']"
      >
        {{ t(link.label) }}
      </DmsLink>
    </template>

    <USelect
      v-if="showsLocaleSwitcher"
      :model-value="locale"
      :items="localesOptions"
      :aria-label="t('empty_layout.footer.language')"
      icon="i-ph-globe"
      trailing-icon="i-ph-caret-up-down"
      color="neutral"
      variant="ghost"
      size="sm"
      class="ms-auto w-auto max-sm:ms-0"
      :ui="{
        base: 'text-muted hover:text-highlighted hover:bg-elevated gap-1.5 bg-transparent text-[12.5px] shadow-none ring-0 md:text-[12.5px]',
        leadingIcon: 'text-muted size-3.5',
        trailingIcon: 'text-dimmed size-3',
        value: 'text-inherit',
      }"
      @update:model-value="onLocaleChange"
    />
  </footer>
</template>
