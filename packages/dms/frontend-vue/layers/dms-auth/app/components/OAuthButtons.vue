<script setup lang="ts">
interface Props {
  note?: string;
}

defineProps<Props>();

const config = useDmsRuntimeConfig();
const route = useDmsRoute();
const { locale } = useI18n();

const providers = computed(() => config.public.dms.oauthProviders ?? []);

function appendQueryParam(
  query: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (typeof value === "string" && value) {
    query.set(key, value);
  }
}

function startUrl(providerId: string): string {
  const query = new URLSearchParams({ language: locale.value });
  appendQueryParam(query, "redirect", route.query.redirect);
  appendQueryParam(query, "invite", route.query.token);

  return `/auth/oauth/${providerId}/start?${query.toString()}`;
}
</script>

<template>
  <div v-if="providers.length" class="space-y-4 pb-7">
    <UButton
      v-for="provider in providers"
      :key="provider.id"
      :to="startUrl(provider.id)"
      :icon="provider.icon"
      :label="$t('page.auth.oauth.continue_with', { provider: provider.label })"
      color="neutral"
      variant="outline"
      size="lg"
      external
      block
    />

    <p v-if="note" class="text-muted text-center text-xs">
      {{ note }}
    </p>

    <USeparator>
      <span class="text-dimmed text-xs font-medium uppercase">
        {{ $t("page.auth.oauth.separator") }}
      </span>
    </USeparator>
  </div>
</template>
