<script setup lang="ts">
import { nextTick, useTemplateRef } from "vue";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";
import AuthBackLink from "../../build/components/AuthBackLink.vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import AuthFormAlert from "../../build/components/AuthFormAlert.vue";
import AuthResendCode from "../../build/components/AuthResendCode.vue";
import { useAuthFormError } from "../../build/composables/useAuthFormError";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";

const route = useDmsRoute();
const { processApiMessage } = useTranslation();
const { t } = useI18n();
const toast = useToast();
const dmsApp = useDmsApp();
const { $authFetch } = useAuthFetch();
const { formError, showFormError, clearFormError, showError } =
  useAuthFormError();

if (!route.query.email) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required email parameter",
  });
}

const PIN_LENGTH = 6;
// Refusals of the typed code: shown under the cells, not above the form.
const CODE_ERRORS = {
  "error.invalid_or_expired_token": "token",
} as const;
const COOLDOWN_DURATION = 60;

const email = computed(() => route.query.email as string);

const isLoading = ref(false);
const form = useTemplateRef("form");
const codeInput = useTemplateRef<{ focus: () => void }>("codeInput");
const codeError = ref<string>();

interface CodeState {
  pin?: string[];
}
const state = reactive<CodeState>({});

// Typing a new code clears the refusal of the previous one.
watch(
  () => state.pin,
  (digits) => {
    if (digits?.some(Boolean)) codeError.value = undefined;
  },
);

const { cooldown, startCooldown } = useCooldown(COOLDOWN_DURATION);

onMounted(() => {
  startCooldown();
});

async function onSubmit(event: FormSubmitEvent<CodeState>) {
  // An empty or partial code is flagged under the cells, not sent.
  const missing = codeEntryError(event.data.pin, PIN_LENGTH);
  if (missing) {
    codeError.value = processApiMessage(missing);
    codeInput.value?.focus();
    return;
  }
  try {
    isLoading.value = true;
    clearFormError();
    codeError.value = undefined;
    const token = (event.data.pin ?? []).join("");

    await $authFetch("/api/auth/validate-forgot-password-token", {
      method: "POST",
      body: {
        token,
        email: email.value,
      },
    });

    await dmsApp.runWithContext(() =>
      navigateDms({
        path: "/auth/recover",
        query: { token, email: email.value },
      }),
    );
  } catch (error: unknown) {
    const isCodeError = await showError(error, "page.forgot.error_title", {
      fields: ["token"],
      codes: CODE_ERRORS,
      show: (_field, message) => {
        codeError.value = message;
      },
    });
    if (isCodeError) state.pin = [];
  } finally {
    isLoading.value = false;
  }
  // The cells are disabled while the request runs: focus them once enabled.
  if (codeError.value) {
    await nextTick();
    codeInput.value?.focus();
  }
}

function onUpdatePin(value: string[] | undefined) {
  if ((value ?? []).join("").length !== PIN_LENGTH) return;

  form.value?.submit();
}

async function requestForgotPassword() {
  try {
    isLoading.value = true;

    await $authFetch("/api/auth/forgot-password", {
      method: "POST",
      body: {
        email: email.value,
      },
    });

    startCooldown();
    // The refusal was about the previous code: the new one starts clean.
    clearFormError();
    codeError.value = undefined;

    toast.add({
      title: t("page.validate.request_sended"),
      description: t("page.validate.request_sended_description"),
      color: "success",
    });
  } catch (error: unknown) {
    showFormError(error, "page.validate.error_title");
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard icon="i-ph-envelope-simple" :title="$t('page.forgot.title_inbox')">
    <template #description>
      <i18n-t
        keypath="page.forgot.description_validation"
        tag="span"
        scope="global"
      >
        <template #email>
          <b>{{ email }}</b>
        </template>
      </i18n-t>
    </template>

    <UForm
      ref="form"
      :state="state"
      novalidate
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

      <DmsOtpInput
        ref="codeInput"
        :label="$t('page.auth.code.label')"
        size="xl"
        is-split
        is-centered
        v-model="state.pin"
        :error="codeError"
        :length="PIN_LENGTH"
        :disabled="isLoading"
        is-otp
        @update:model-value="onUpdatePin"
      />

      <UButton
        :loading="isLoading"
        :label="$t('page.forgot.reset_button')"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <AuthResendCode
      :cooldown="cooldown"
      :disabled="isLoading"
      @resend="requestForgotPassword"
    />

    <AuthBackLink to="/auth" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
