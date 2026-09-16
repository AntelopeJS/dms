<script setup lang="ts">
import type { SelectItem } from "@nuxt/ui";

const { locale, setLocale, t } = useI18n();
const { uniqueLocales } = useUniqueLocales();
const { links } = useFooterLinks();

const localesOptions: SelectItem[] = uniqueLocales.value.map((lang) => ({
  label: lang.name,
  value: lang.code,
}));

async function onLocaleChange(code: unknown) {
  await setLocale(code as typeof locale.value);
}
</script>

<template>
  <footer class="border-default mt-12 border-t">
    <UContainer class="p-4">
      <div
        class="text-muted flex flex-col items-center gap-3 text-sm md:flex-row md:justify-between md:gap-4"
      >
        <div class="flex flex-col items-center gap-2 md:flex-row md:gap-4">
          <span>&copy; Antelope</span>
          <DmsLink
            v-for="link in links"
            :key="link.id"
            :to="link.to"
            class="hover:text-default"
          >
            {{ t(link.label) }}
          </DmsLink>
        </div>

        <USelect
          :model-value="locale"
          :items="localesOptions"
          :ui="{ value: 'text-muted' }"
          color="neutral"
          variant="none"
          class="w-auto"
          @update:model-value="onLocaleChange"
        />
      </div>
    </UContainer>
  </footer>
</template>
