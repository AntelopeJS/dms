<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";
import AuthFormAlert from "../../build/components/AuthFormAlert.vue";
import DmsPasswordInput from "#dms-ui/app/build/components/form/PasswordInput.vue";
import {
  type AuthFormHandle,
  useAuthFormError,
} from "../../build/composables/useAuthFormError";
import { AUTH_LINK_CLASS } from "../../build/utils/authStyles";
import {
  focusFirstFormError,
  useLiveFormErrors,
  useLocalizedSchema,
} from "#dms-core/app/composables/useFormValidation";
import { ACCOUNTS_LIST_ROUTE } from "../../utils/accountsFlow";

const route = useDmsRoute();
const homepage = useHomepage();
const dmsApp = useDmsApp();
const { metaTitle } = useSystemState();
const { links: extraLinks } = useAuthLinks("login");
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

useOAuthErrorToast();

const isLoading = ref(false);

const cameFromAccounts = computed(() => isFromAccountsList(route.query));

const fields = z.object({
  email: z.string().email(),
  password: z.string().nonempty(),
  keep_login: z.boolean().optional(),
});
type Schema = z.output<typeof fields>;
const schema = useLocalizedSchema(fields);
const state = reactive<Partial<Schema>>({});
useLiveFormErrors(form, state);

function isTwoFactorRequired(
  response: unknown,
): response is TwoFactorRequiredResponse {
  return (
    !!response && typeof response === "object" && "requires_2fa" in response
  );
}

function isTenantAssignmentRequired(
  response: unknown,
): response is TenantAssignmentRequiredResponse {
  return (
    !!response &&
    typeof response === "object" &&
    "requires_tenant_assignment" in response
  );
}

async function handleTwoFactorRedirect(response: TwoFactorRequiredResponse) {
  await navigateDms({
    path: "/auth/2fa",
    query: withAccountsFlag(route.query, {
      token: response.two_factor_token,
      methods: response.methods.join(","),
    }),
  });
}

async function handleTenantAssignmentRedirect(
  response: TenantAssignmentRequiredResponse,
) {
  await navigateDms({
    path: "/auth/no-workspace",
    query: {
      token: response.tenant_assignment_token,
    },
  });
}

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  const redirectUrl = route.query.redirect as string | undefined;

  try {
    isLoading.value = true;
    clearFormError();

    const response = await $fetch("/auth/login", {
      method: "POST",
      body: payload.data,
    });

    if (isTwoFactorRequired(response)) {
      await dmsApp.runWithContext(() => handleTwoFactorRedirect(response));
      return;
    }

    if (isTenantAssignmentRequired(response)) {
      await dmsApp.runWithContext(() =>
        handleTenantAssignmentRedirect(response),
      );
      return;
    }

    await dmsApp.runWithContext(() =>
      usePostLoginRedirect(redirectUrl || homepage),
    );
  } catch (error: unknown) {
    // Wrong credentials name no field: they stay above the form.
    await showError(error, "page.auth.error_title", {
      fields: ["email", "password"],
      form,
    });
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard :title="$t('page.auth.login_title')">
    <template #description>
      <i18n-t
        v-if="metaTitle"
        keypath="page.auth.login_subtitle_workspace"
        tag="span"
        scope="global"
      >
        <template #workspace>
          <b>{{ metaTitle }}</b>
        </template>
      </i18n-t>
      <template v-else>{{ $t("page.auth.login_subtitle") }}</template>
    </template>

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

      <UFormField :label="$t('form.email.label')" name="email">
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="username"
          :placeholder="$t('page.auth.email_placeholder')"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="$t('form.password.label')"
        name="password"
        :ui="{ hint: 'font-sans text-[12.5px]' }"
      >
        <template #hint>
          <DmsLink to="/auth/forgot" :class="AUTH_LINK_CLASS">
            {{ $t("form.password.recover") }}
          </DmsLink>
        </template>

        <DmsPasswordInput
          v-model="state.password"
          size="lg"
          autocomplete="current-password"
          placeholder="••••••••"
        />
      </UFormField>

      <UFormField name="keep_login">
        <UCheckbox
          v-model="state.keep_login"
          :label="$t('page.auth.keep_login')"
        />
      </UFormField>

      <div class="grid gap-2">
        <UButton
          :loading="isLoading"
          :label="$t('button.login')"
          type="submit"
          size="lg"
          class="justify-center"
          block
        />

        <UButton
          v-if="cameFromAccounts"
          :label="$t('page.auth.back_to_accounts')"
          icon="i-ph-arrow-left"
          color="neutral"
          variant="ghost"
          :disabled="isLoading"
          :to="ACCOUNTS_LIST_ROUTE"
          type="button"
          class="justify-center"
          block
        />
      </div>
    </UForm>

    <div
      v-if="extraLinks.length"
      class="mt-5 flex flex-col items-center gap-2 text-[13px]"
    >
      <DmsLink
        v-for="link in extraLinks"
        :key="link.id"
        :to="link.to"
        :class="AUTH_LINK_CLASS"
      >
        {{ $t(link.label) }}
      </DmsLink>
    </div>
  </StageCard>
</template>
