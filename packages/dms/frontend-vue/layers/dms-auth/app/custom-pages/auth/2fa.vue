<script setup lang="ts">
import { nextTick, useTemplateRef } from "vue";
import StageCard from "../../../../dms-layout/app/build/components/layout/StageCard.vue";
import AuthBackLink from "../../build/components/AuthBackLink.vue";
import DmsOtpInput from "#dms-ui/app/build/components/form/OtpInput.vue";
import AuthFormAlert from "../../build/components/AuthFormAlert.vue";
import { useAuthFormError } from "../../build/composables/useAuthFormError";
import { AUTH_LINK_CLASS } from "../../build/utils/authStyles";
import { codeEntryError } from "#dms-core/app/composables/useFormValidation";

type TwoFactorMethod = "totp" | "email";

const { t } = useI18n();
const toast = useToast();
const route = useDmsRoute();
const { processApiMessage } = useTranslation();
const { formError, showFormError, clearFormError, showError } =
  useAuthFormError();

const token = computed(() => (route.query.token as string) || "");
const availableMethods = computed(() =>
  ((route.query.methods as string) || "").split(",").filter(Boolean),
);

const PIN_LENGTH = 6;
// Refusals of the typed code: shown under the cells, not above the form.
const CODE_ERRORS = {
  "error.invalid_2fa_code": "code",
  "error.2fa_code_expired": "code",
} as const;

const METHOD_ICONS: Record<TwoFactorMethod, string> = {
  totp: "i-ph-device-mobile",
  email: "i-ph-envelope-simple",
};

const METHOD_DESCRIPTION_KEYS: Record<TwoFactorMethod, string> = {
  totp: "page.2fa.description_totp",
  email: "page.2fa.description_email",
};

const isLoading = ref(false);
const activeMethod = ref<TwoFactorMethod>("totp");
const pin = ref<string[]>([]);
const isEmailSent = ref(false);
const codeError = ref<string>();
const codeInput = useTemplateRef<{ focus: () => void }>("codeInput");

// Typing a new code clears the refusal of the previous one.
watch(pin, (digits) => {
  if (digits.some(Boolean)) codeError.value = undefined;
});

const hasTotp = computed(() => availableMethods.value.includes("totp"));
const hasEmail = computed(() => availableMethods.value.includes("email"));
const isCodeVisible = computed(
  () => activeMethod.value === "totp" || isEmailSent.value,
);

const backToLoginTarget = computed(() => ({
  path: "/auth",
  query: withAccountsFlag(route.query),
}));

const backupTarget = computed(() => ({
  path: "/auth/backup",
  query: withAccountsFlag(route.query, {
    token: token.value,
    methods: route.query.methods,
  }),
}));

watchEffect(() => {
  if (!hasTotp.value && hasEmail.value) {
    activeMethod.value = "email";
  }
});

async function requestEmailCode() {
  try {
    await $fetch("/auth/request-2fa-email", {
      method: "POST",
      body: { token: token.value },
    });
    isEmailSent.value = true;
    toast.add({
      title: t("page.2fa.email_sent"),
      color: "success",
    });
  } catch (error: unknown) {
    showFormError(error, "page.2fa.email_error");
  }
}

async function verify() {
  // An empty or partial code is flagged under the cells, not sent.
  const missing = codeEntryError(pin.value, PIN_LENGTH);
  if (missing) {
    codeError.value = processApiMessage(missing);
    codeInput.value?.focus();
    return;
  }
  const code = pin.value.join("");

  isLoading.value = true;
  clearFormError();
  codeError.value = undefined;
  try {
    await $fetch("/auth/verify-2fa", {
      method: "POST",
      body: {
        token: token.value,
        code,
        method: activeMethod.value,
      },
    });

    await usePostLoginRedirect();
  } catch (error: unknown) {
    pin.value = [];
    await showError(error, "page.2fa.error_title", {
      fields: ["code"],
      codes: CODE_ERRORS,
      show: (_field, message) => {
        codeError.value = message;
      },
    });
    await nextTick();
    codeInput.value?.focus();
  } finally {
    isLoading.value = false;
  }
}

function switchMethod(method: TwoFactorMethod) {
  activeMethod.value = method;
  pin.value = [];
  isEmailSent.value = false;
  codeError.value = undefined;
  clearFormError();
}
</script>

<template>
  <StageCard
    :icon="METHOD_ICONS[activeMethod]"
    :title="$t('page.2fa.title')"
    :description="$t(METHOD_DESCRIPTION_KEYS[activeMethod])"
  >
    <form class="mt-[22px] grid gap-4" @submit.prevent="verify">
      <AuthFormAlert :error="formError" />

      <UButton
        v-if="!isCodeVisible"
        :label="$t('page.2fa.send_email')"
        icon="i-ph-paper-plane-tilt"
        size="lg"
        class="justify-center"
        block
        @click="requestEmailCode"
      />

      <template v-else>
        <DmsOtpInput
          ref="codeInput"
          :label="$t('page.auth.code.label')"
          size="xl"
          is-split
          is-centered
          v-model="pin"
          :length="PIN_LENGTH"
          :error="codeError"
        />
        <UButton
          :loading="isLoading"
          :label="$t('page.2fa.verify')"
          type="submit"
          size="lg"
          class="justify-center"
          block
        />
      </template>
    </form>

    <div class="text-muted mt-5 flex flex-col items-center gap-1.5 text-[13px]">
      <button
        v-if="hasEmail && activeMethod === 'totp'"
        type="button"
        :class="AUTH_LINK_CLASS"
        @click="switchMethod('email')"
      >
        {{ $t("page.2fa.use_email") }}
      </button>
      <button
        v-if="hasTotp && activeMethod === 'email'"
        type="button"
        :class="AUTH_LINK_CLASS"
        @click="switchMethod('totp')"
      >
        {{ $t("page.2fa.use_totp") }}
      </button>
      <DmsLink :to="backupTarget" :class="AUTH_LINK_CLASS">
        {{ $t("page.2fa.use_backup") }}
      </DmsLink>
    </div>

    <AuthBackLink :to="backToLoginTarget" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
