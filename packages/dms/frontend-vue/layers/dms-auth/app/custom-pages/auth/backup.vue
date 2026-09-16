<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const route = useDmsRoute();

const token = computed(() => (route.query.token as string) || "");

const twoFactorTarget = computed(() => ({
  path: "/auth/2fa",
  query: withAccountsFlag(route.query, {
    token: token.value,
    methods: route.query.methods,
  }),
}));

const backToLoginTarget = computed(() => ({
  path: "/auth",
  query: withAccountsFlag(route.query),
}));

const isLoading = ref(false);

const schema = z.object({
  code: z.string().min(1),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({ code: undefined });

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true;
  try {
    await $fetch("/auth/verify-2fa", {
      method: "POST",
      body: {
        token: token.value,
        code: payload.data.code,
        method: "backup",
      },
    });

    await usePostLoginRedirect();
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.backup.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <DmsCard variant="elevated" :padded="false" class="grid gap-7 p-7 sm:p-12">
      <div>
        <h1 class="pb-5 text-2xl font-bold">
          {{ $t("page.backup.title") }}
        </h1>
        <p class="text-muted text-sm font-normal">
          {{ $t("page.backup.description") }}
        </p>
      </div>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <UFormField
          class="text-sm font-medium"
          :label="$t('page.backup.code')"
          name="code"
        >
          <UInput
            v-model="state.code"
            :loading="isLoading"
            class="h-9 w-full"
            type="text"
          />
        </UFormField>
        <div class="flex flex-col gap-4">
          <UButton :loading="isLoading" type="submit" block>
            {{ $t("button.continue") }}
          </UButton>
          <div class="flex flex-col gap-2 text-center">
            <DmsLink :to="twoFactorTarget" class="text-muted text-sm">
              {{ $t("page.2fa.back_to_2fa") }}
            </DmsLink>
            <DmsLink :to="backToLoginTarget" class="text-muted text-sm">
              {{ $t("button.back_to_login") }}
            </DmsLink>
          </div>
        </div>
      </UForm>
    </DmsCard>
  </div>
</template>
