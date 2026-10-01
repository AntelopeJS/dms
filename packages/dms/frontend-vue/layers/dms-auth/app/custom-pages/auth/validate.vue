<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthCodeInput from "../../components/AuthCodeInput.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import AuthResendCode from "../../components/AuthResendCode.vue";
import { useAuthFormError } from "../../composables/useAuthFormError";

const route = useDmsRoute();
const { t } = useI18n();
const toast = useToast();
const dmsApp = useDmsApp();
const homepage = useHomepage();
const { $authFetch } = useAuthFetch();
const { formError, showFormError, clearFormError } = useAuthFormError();

if (!route.query.id) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required id parameter",
  });
}

const PIN_LENGTH = 6;
const COOLDOWN_DURATION = 60;

const isLoading = ref(false);
const form = useTemplateRef("form");

const schema = z.object({
  pin: z.string().array().length(PIN_LENGTH),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({});

const isCodeComplete = computed(
  () => (state.pin ?? []).join("").length === PIN_LENGTH,
);

const { cooldown, startCooldown } = useCooldown(COOLDOWN_DURATION);

onMounted(() => {
  startCooldown();
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    clearFormError();
    await $authFetch("/api/auth/verify-email", {
      method: "POST",
      body: {
        token: event.data.pin.join(""),
        user_id: route.query.id as string,
      },
    });

    await dmsApp.runWithContext(() => navigateDms(homepage));
  } catch (error: unknown) {
    showFormError(error, "page.validate.error_title");
  } finally {
    isLoading.value = false;
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
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

      <AuthCodeInput
        v-model="state.pin"
        :length="PIN_LENGTH"
        :disabled="isLoading"
        is-otp
        @update:model-value="onUpdatePin"
      />

      <UButton
        :loading="isLoading"
        :disabled="!isCodeComplete"
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
