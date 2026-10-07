<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";
import AuthBackLink from "../../build/components/AuthBackLink.vue";
import AuthFormAlert from "../../build/components/AuthFormAlert.vue";
import AuthNewPasswordField from "../../build/components/AuthNewPasswordField.vue";
import DmsHiddenUsername from "#dms-ui/app/build/components/form/HiddenUsername.vue";
import {
  type AuthFormHandle,
  useAuthFormError,
} from "../../build/composables/useAuthFormError";
import {
  focusFirstFormError,
  useLiveFormErrors,
  useLocalizedSchema,
} from "#dms-core/app/composables/useFormValidation";

const route = useDmsRoute();
const dmsApp = useDmsApp();
const { $authFetch } = useAuthFetch();
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

if (!route.query.token || !route.query.email) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required authentication parameters",
  });
}

const isLoading = ref(false);

const fields = z.object({
  password: passwordSchema,
});
type Schema = z.output<typeof fields>;
const schema = useLocalizedSchema(fields);

const state = reactive<Partial<Schema>>({
  password: undefined,
});
useLiveFormErrors(form, state);

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
    // A refused password shows under its field; an expired link above the form.
    await showError(error, "page.forgot.error_title", {
      fields: ["password"],
      form,
    });
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
      ref="form"
      :schema="schema"
      :state="state"
      novalidate
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
      @error="focusFirstFormError($event.errors)"
    >
      <AuthFormAlert :error="formError" />

      <DmsHiddenUsername :username="route.query.email as string" />

      <AuthNewPasswordField
        v-model="state.password"
        :label="$t('page.recover.new_password')"
      />

      <UButton
        :label="$t('page.recover.submit')"
        :loading="isLoading"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <AuthBackLink to="/auth" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
