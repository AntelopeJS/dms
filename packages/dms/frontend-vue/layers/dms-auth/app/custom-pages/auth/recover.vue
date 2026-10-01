<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthBackLink from "../../components/AuthBackLink.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import AuthNewPasswordField from "../../components/AuthNewPasswordField.vue";
import { useAuthFormError } from "../../composables/useAuthFormError";

const route = useDmsRoute();
const dmsApp = useDmsApp();
const { $authFetch } = useAuthFetch();
const { formError, showFormError, clearFormError } = useAuthFormError();

if (!route.query.token || !route.query.email) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required authentication parameters",
  });
}

const isLoading = ref(false);
const isPasswordValid = ref(false);

const schema = z.object({
  password: passwordSchema,
});
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  password: undefined,
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    clearFormError();
    await $authFetch("/api/auth/reset-password", {
      method: "POST",
      body: {
        password: event.data.password,
        token: route.query.token,
        email: route.query.email,
      },
    });

    await dmsApp.runWithContext(() => navigateDms("/auth/recover-success"));
  } catch (error: unknown) {
    showFormError(error, "page.forgot.error_title");
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard
    icon="i-ph-password"
    :title="$t('page.recover.title')"
    :description="$t('page.recover.description')"
  >
    <UForm
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

      <AuthNewPasswordField
        v-model="state.password"
        v-model:valid="isPasswordValid"
        :label="$t('page.recover.new_password')"
      />

      <UButton
        :label="$t('page.recover.submit')"
        :loading="isLoading"
        :disabled="!isPasswordValid"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <AuthBackLink to="/auth" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
