<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthBackLink from "../../components/AuthBackLink.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import {
  type AuthFormHandle,
  useAuthFormError,
} from "../../composables/useAuthFormError";

const { $authFetch } = useAuthFetch();
const dmsApp = useDmsApp();
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

const isLoading = ref(false);

const schema = z.object({
  email: z.string().trim().email(),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    clearFormError();

    await $authFetch("/api/auth/forgot-password", {
      method: "POST",
      body: {
        email: event.data.email,
      },
    });

    await dmsApp.runWithContext(() =>
      navigateDms({
        path: "/auth/forgot-validation",
        query: { email: event.data.email },
      }),
    );
  } catch (error: unknown) {
    // A refused address shows under its field; anything else above the form.
    await showError(error, "page.forgot.error_title", {
      fields: ["email"],
      form,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard
    icon="i-ph-lock-key"
    :title="$t('page.forgot.title_forget')"
    :description="$t('page.forgot.description_forget')"
  >
    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

      <UFormField :label="$t('form.email.label')" name="email">
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          icon="i-ph-envelope-simple"
          :placeholder="$t('page.auth.email_placeholder')"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UButton
        :loading="isLoading"
        :label="$t('page.forgot.send_code')"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <AuthBackLink to="/auth" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
