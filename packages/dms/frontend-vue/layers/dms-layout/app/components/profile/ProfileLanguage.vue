<script setup lang="ts">
const { locale } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { changeLanguage } = useUserLanguage();

const languageOptions = computed(() =>
  uniqueLocales.value.map((lang) => ({
    label: lang.name,
    value: lang.code,
  })),
);
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
            @update:model-value="changeLanguage"
          />
        </div>
      </section>
    </div>
  </DmsCard>
</template>
