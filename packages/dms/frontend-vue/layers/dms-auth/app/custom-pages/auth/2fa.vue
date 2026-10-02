<script setup lang="ts">
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthBackLink from "../../components/AuthBackLink.vue";
import AuthCodeInput from "../../components/AuthCodeInput.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import { useAuthFormError } from "../../composables/useAuthFormError";
import { AUTH_LINK_CLASS } from "../../utils/authStyles";

type TwoFactorMethod = "totp" | "email";

const { t } = useI18n();
const toast = useToast();
const route = useDmsRoute();
const { formError, showFormError, clearFormError } = useAuthFormError();

const token = computed(() => (route.query.token as string) || "");
const availableMethods = computed(() =>
  ((route.query.methods as string) || "").split(",").filter(Boolean),
);

const PIN_LENGTH = 6;

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

const hasTotp = computed(() => availableMethods.value.includes("totp"));
const hasEmail = computed(() => availableMethods.value.includes("email"));
const isCodeComplete = computed(() => pin.value.join("").length === PIN_LENGTH);
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
  const code = pin.value.join("");
  if (code.length !== PIN_LENGTH) return;

  isLoading.value = true;
  clearFormError();
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
    showFormError(error, "page.2fa.error_title");
    pin.value = [];
  } finally {
    isLoading.value = false;
  }
}

function switchMethod(method: TwoFactorMethod) {
  activeMethod.value = method;
  pin.value = [];
  isEmailSent.value = false;
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
        <AuthCodeInput v-model="pin" :length="PIN_LENGTH" />
        <UButton
          :loading="isLoading"
          :disabled="!isCodeComplete"
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
