<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import AuthNewPasswordField from "../../components/AuthNewPasswordField.vue";
import {
  type AuthFormHandle,
  useAuthFormError,
} from "../../composables/useAuthFormError";
import { AUTH_LINK_CLASS } from "../../utils/authStyles";
import {
  focusFirstFormError,
  useLiveFormErrors,
  useLocalizedSchema,
} from "#dms-core/app/composables/useFormValidation";

const MIN_NAME_LENGTH = 2;

const { locale, locales, setLocale } = useI18n();
const config = useDmsRuntimeConfig();
const homepage = useHomepage();
const dmsApp = useDmsApp();
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

const route = useDmsRoute();
const queryToken = computed(() => route.query.token as string);
const queryEmail = computed(() => route.query.email as string);
const queryName = computed(() => route.query.name as string | undefined);
// Only an invitation email links here, so a link without its token was cut
// short on the way: say so, rather than answering with a server error.
const hasInvitationToken = computed(
  () => typeof queryToken.value === "string" && queryToken.value !== "",
);

// The invitation link carries the language the invitee was invited in: the
// page opens in it, and the footer switcher still lets them pick another one
// before the account is created with whichever is current.
const invitationLanguage = locales.value.find(
  (available) => available.code === route.query.lang,
);
if (invitationLanguage && invitationLanguage.code !== locale.value) {
  void setLocale(invitationLanguage.code);
}

const isLoading = ref(false);

const fields = z.object({
  email: z.string().email(),
  name: z.string().trim().min(MIN_NAME_LENGTH),
  password: passwordSchema,
});
type Schema = z.output<typeof fields>;
const schema = useLocalizedSchema(fields);
const state = reactive<Partial<Schema>>({
  email: queryEmail.value,
  name: queryName.value,
});
useLiveFormErrors(form, state);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    clearFormError();

    await $fetch("/auth/signup", {
      method: "POST",
      body: {
        ...payload.data,
        lang: locale.value,
        token: queryToken.value,
      },
    });

    await dmsApp.runWithContext(() =>
      usePostLoginRedirect(
        config.public.dms.mustValidateEmail ? "/auth/validate" : homepage,
      ),
    );
  } catch (error: unknown) {
    // A refused value (an address already used) shows under its field;
    // anything else above the form.
    await showError(error, "page.signup.error_title", {
      fields: ["name", "email", "password"],
      codes: { "error.email_already_used": "email" },
      form,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard
    v-if="!hasInvitationToken"
    icon="i-ph-link-break"
    tone="warning"
    :title="$t('page.signup.invalid_invitation_title')"
    :description="$t('page.signup.invalid_invitation_description')"
    data-testid="signup-invalid-invitation"
  >
    <UButton
      :label="$t('button.login')"
      to="/auth"
      size="lg"
      class="mt-[22px] justify-center"
      block
    />
  </StageCard>

  <StageCard
    v-else
    :title="$t('page.signup.create_account_title')"
    :description="$t('page.signup.description')"
  >
    <DmsOAuthButtons />

    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      novalidate
      class="mt-5 grid gap-4"
      @submit="onSubmit"
      @error="focusFirstFormError($event.errors)"
    >
      <AuthFormAlert :error="formError" />

      <UFormField :label="$t('form.name.label')" name="name">
        <UInput
          v-model="state.name"
          autocomplete="name"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField :label="$t('form.email.label')" name="email">
        <UInput
          v-model="state.email"
          type="email"
          icon="i-ph-envelope-simple"
          size="lg"
          class="w-full"
          disabled
        />
      </UFormField>

      <AuthNewPasswordField
        v-model="state.password"
        :label="$t('form.password.label')"
      />

      <UButton
        :label="$t('page.signup.submit')"
        :loading="isLoading"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <p class="text-muted mt-5 text-center text-[13px]">
      {{ $t("page.auth.already_have") }}
      <DmsLink to="/auth" :class="AUTH_LINK_CLASS">
        {{ $t("button.login") }}
      </DmsLink>
    </p>
  </StageCard>
</template>
