<script setup lang="ts">
import { nextTick, useTemplateRef } from "vue";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import AuthResendCode from "../../components/AuthResendCode.vue";
import { useAuthFormError } from "../../composables/useAuthFormError";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";

const route = useDmsRoute();
const { processApiMessage } = useTranslation();
const { t } = useI18n();
const toast = useToast();
const dmsApp = useDmsApp();
const homepage = useHomepage();
const { $authFetch } = useAuthFetch();
const { formError, showFormError, clearFormError, showError } =
  useAuthFormError();

if (!route.query.id) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required id parameter",
  });
}

const PIN_LENGTH = 6;
// Refusals of the typed code: shown under the cells, not above the form.
const CODE_ERRORS = {
  "error.invalid_token": "token",
  "error.token_expired": "token",
} as const;
const COOLDOWN_DURATION = 60;

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
    await $authFetch("/api/auth/verify-email", {
      method: "POST",
      body: {
        token: (event.data.pin ?? []).join(""),
        user_id: route.query.id as string,
      },
    });

    await dmsApp.runWithContext(() => navigateDms(homepage));
  } catch (error: unknown) {
    const isCodeError = await showError(error, "page.validate.error_title", {
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

async function requestEmailValidation() {
  try {
    isLoading.value = true;
    await $authFetch("/api/auth/request-email-verification");

    startCooldown();

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
  <StageCard
    icon="i-ph-envelope-simple-open"
    :title="$t('page.validate.title')"
    :description="$t('page.validate.description')"
  >
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
        :label="$t('page.validate.submit')"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <AuthResendCode
      :cooldown="cooldown"
      :disabled="isLoading"
      @resend="requestEmailValidation"
    />
  </StageCard>
</template>
