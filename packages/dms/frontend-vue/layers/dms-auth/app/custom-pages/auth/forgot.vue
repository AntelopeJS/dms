<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const { $authFetch } = useAuthFetch();

const isLoading = ref(false);

const schema = z.object({
  email: z.string().email(),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;

    await $authFetch("/api/auth/forgot-password", {
      method: "POST",
      body: {
        email: event.data.email,
      },
    });

    navigateDms(`/auth/forgot-validation?email=${event.data.email}`);
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.forgot.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <DmsCard variant="elevated" :padded="false" class="p-7 sm:p-12">
      <h1 class="pb-5 text-2xl font-bold">
        {{ $t("page.forgot.title_forget") }}
      </h1>

      <p class="text-muted pb-7 text-sm font-normal">
        {{ $t("page.forgot.description_forget") }}
      </p>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <UFormField
          class="text-sm font-medium"
          :label="$t('form.email.label')"
          name="email"
        >
          <UInput v-model="state.email" type="email" class="h-9 w-full" />
        </UFormField>

        <div class="grid gap-2">
          <UButton
            :loading="isLoading"
            :label="$t('button.continue')"
            type="submit"
            block
          />

          <UButton
            :label="$t('button.back_to_login')"
            color="neutral"
            variant="ghost"
            to="/auth"
            type="button"
            block
          />
        </div>
      </UForm>
    </DmsCard>
  </div>
</template>
