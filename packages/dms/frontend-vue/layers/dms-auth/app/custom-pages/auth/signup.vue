<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "#dms-layout/app/entries/components/layout/StageCard";
import AuthFormAlert from "../../build/components/AuthFormAlert.vue";
import AuthNewPasswordField from "../../build/components/AuthNewPasswordField.vue";
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
import { resolveApiErrorMessage } from "#dms-core/app/composables/useApiError";
import { isString } from "#dms-core/app/utils/type-check";

const MIN_NAME_LENGTH = 2;

/** Why an invitation link cannot open the signup form. */
type ClosedInvitation = "invalid" | "expired" | "revoked" | "replaced" | "used";
type InvitationState = "checking" | "open" | ClosedInvitation;

interface ClosedInvitationNotice {
  icon: string;
  title: string;
  description: string;
}

const CLOSED_INVITATION_CODES: Record<
  ReturnType<typeof resolveApiErrorMessage>,
  ClosedInvitation
> = {
  "error.invalid_token": "invalid",
  "error.invite_expired": "expired",
  "error.invite_revoked": "revoked",
  "error.invite_replaced": "replaced",
  "error.invite_used": "used",
};

const CLOSED_INVITATION_NOTICES: Record<
  ClosedInvitation,
  ClosedInvitationNotice
> = {
  invalid: {
    icon: "i-ph-link-break",
    title: "page.signup.invalid_invitation_title",
    description: "page.signup.invalid_invitation_description",
  },
  expired: {
    icon: "i-ph-hourglass",
    title: "page.signup.invitation_expired_title",
    description: "page.signup.invitation_expired_description",
  },
  revoked: {
    icon: "i-ph-prohibit",
    title: "page.signup.invitation_revoked_title",
    description: "page.signup.invitation_revoked_description",
  },
  replaced: {
    icon: "i-ph-envelope-simple",
    title: "page.signup.invitation_replaced_title",
    description: "page.signup.invitation_replaced_description",
  },
  used: {
    icon: "i-ph-user-check",
    title: "page.signup.invitation_used_title",
    description: "page.signup.invitation_used_description",
  },
};

function closedInvitationOf(
  error: Parameters<typeof resolveApiErrorMessage>[0],
): ClosedInvitation | undefined {
  return CLOSED_INVITATION_CODES[resolveApiErrorMessage(error)];
}

const { locale, locales, setLocale } = useI18n();
const config = useDmsRuntimeConfig();
const homepage = useHomepage();
const dmsApp = useDmsApp();
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

const route = useDmsRoute();
const queryToken = computed(() => route.query.token);
const queryEmail = computed(() => route.query.email);
const queryName = computed(() => route.query.name);

const hasInvitationToken = computed(
  () => isString(queryToken.value) && queryToken.value !== "",
);

const invitationCheck = useApiData(
  () => (hasInvitationToken.value ? "/api/auth/validate-invite-token" : null),
  {
    method: "POST",
    body: () => ({ token: queryToken.value, email: queryEmail.value }),
  },
);

const closedOnSignup = ref<ClosedInvitation>();
const invitationState = computed<InvitationState>(() => {
  if (!hasInvitationToken.value) return "invalid";
  if (closedOnSignup.value) return closedOnSignup.value;
  const { status, error } = invitationCheck;
  if (status.value === "idle" || status.value === "pending") return "checking";
  return error.value ? (closedInvitationOf(error.value) ?? "open") : "open";
});
const closedInvitation = computed(() =>
  invitationState.value in CLOSED_INVITATION_NOTICES
    ? // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The existing in lookup includes inherited keys; stronger own-key validation would change malformed error-code handling, and TypeScript does not narrow the key here.
      CLOSED_INVITATION_NOTICES[invitationState.value as ClosedInvitation]
    : undefined,
);

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

    await $fetch("/auth/register", {
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
    const closed = closedInvitationOf(error);
    if (closed) {
      closedOnSignup.value = closed;
      return;
    }

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
    v-if="closedInvitation"
    :icon="closedInvitation.icon"
    tone="warning"
    :title="$t(closedInvitation.title)"
    :description="$t(closedInvitation.description)"
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
    v-else-if="invitationState === 'checking'"
    icon="i-ph-spinner"
    icon-class="animate-spin"
    tone="neutral"
    :title="$t('page.signup.create_account_title')"
    :description="$t('page.signup.checking_invitation')"
    data-testid="signup-checking-invitation"
  />

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
