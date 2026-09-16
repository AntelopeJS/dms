interface LocaleDefinition {
  code: string;
}

export const useUniqueLocales = () => {
  const { locales } = useI18n();

  const uniqueLocales = computed(() => {
    const seen = new Set<string>();
    return locales.value.filter((lang: LocaleDefinition) => {
      if (seen.has(lang.code)) return false;
      seen.add(lang.code);
      return true;
    });
  });

  return { uniqueLocales };
};
