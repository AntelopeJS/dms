<script setup lang="ts">
const { locale, setLocale } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { $authFetch } = useAuthFetch();
const { user, fetch: refreshUser } = useUserSession();

const languageOptions = computed(() =>
  uniqueLocales.value.map((lang) => ({
    label: lang.name,
    value: lang.code,
  })),
);

const handleLanguageChange = async (newLanguage: "en" | "fr") => {
  setLocale(newLanguage);

  try {
    await $authFetch("/settings/user/profile", {
      method: "POST",
      body: {
        name: user.value?.name,
        email: user.value?.email,
        language: newLanguage,
      },
    });

    await refreshUser();
  } catch {
    /* ignore — silently skip the update on network / backend errors */
  }
};
</script>

<template>
  <DmsCard class="my-5">
    <section class="space-y-1">
      <h2 class="text-highlighted text-2xl font-semibold sm:text-xl">
        {{ $t("page.settings.profile.language_title") }}
      </h2>
      <p class="text-dimmed text-base sm:text-sm">
        {{ $t("page.settings.profile.language_description") }}
      </p>
    </section>

    <USeparator class="my-6" />

    <div>
      <section
        class="grid grid-cols-1 gap-2 sm:grid-cols-[min(50%,--spacing(80))_auto]"
      >
        <div>
          <label
            for="name"
            class="text-default block text-base font-semibold sm:text-sm"
          >
            {{ $t("page.settings.profile.language_title") }}
          </label>
        </div>

        <div>
          <USelect
            class="w-full"
            :items="languageOptions"
            :model-value="locale"
            @update:model-value="handleLanguageChange"
          />
        </div>
      </section>
    </div>
  </DmsCard>
</template>
