<script setup lang="ts">
import { useWindowSize } from "@vueuse/core";

const { t } = useI18n();
const toast = useToast();
const route = useDmsRoute();
const { width } = useWindowSize();

const token = computed(() => (route.query.token as string) || "");
const availableMethods = computed(() =>
  ((route.query.methods as string) || "").split(",").filter(Boolean),
);

const MOBILE_BREAKPOINT = 375;
const PIN_LENGTH = 6;

const pinSize = computed(() => (width.value < MOBILE_BREAKPOINT ? "lg" : "xl"));

const isLoading = ref(false);
const activeMethod = ref<"totp" | "email">("totp");
const pin = ref<string[]>([]);
const isEmailSent = ref(false);

const hasTotp = computed(() => availableMethods.value.includes("totp"));
const hasEmail = computed(() => availableMethods.value.includes("email"));

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
    useApiError(error, {
      title: "page.2fa.email_error",
    });
  }
}

async function verify() {
  const code = pin.value.join("");
  if (code.length !== PIN_LENGTH) return;

  isLoading.value = true;
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
    useApiError(error, {
      title: "page.2fa.error_title",
    });
    pin.value = [];
  } finally {
    isLoading.value = false;
  }
}

function switchToEmail() {
  activeMethod.value = "email";
  pin.value = [];
}

function switchToTotp() {
  activeMethod.value = "totp";
  pin.value = [];
  isEmailSent.value = false;
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <DmsCard variant="elevated" :padded="false" class="grid gap-7 p-6 sm:p-12">
      <div>
        <h1 class="pb-5 text-2xl font-bold">
          {{ $t("page.2fa.title") }}
        </h1>
        <p class="text-muted text-sm font-normal">
          {{
            activeMethod === "totp"
              ? $t("page.2fa.description_totp")
              : $t("page.2fa.description_email")
          }}
        </p>
      </div>

      <div
        v-if="activeMethod === 'email' && !isEmailSent"
        class="flex flex-col gap-4"
      >
        <UButton block @click="requestEmailCode">
          {{ $t("page.2fa.send_email") }}
        </UButton>
      </div>

      <div
        v-if="activeMethod === 'totp' || isEmailSent"
        class="flex flex-col gap-7"
      >
        <div class="flex items-center justify-center">
          <UPinInput
            v-model="pin"
            :length="PIN_LENGTH"
            type="text"
            :size="pinSize"
          />
        </div>
        <UButton :loading="isLoading" block @click="verify">
          {{ $t("button.continue") }}
        </UButton>
      </div>

      <div class="flex flex-col gap-2 text-center">
        <ULink
          v-if="hasEmail && activeMethod === 'totp'"
          class="text-muted text-sm"
          @click.prevent="switchToEmail"
        >
          {{ $t("page.2fa.use_email") }}
        </ULink>
        <ULink
          v-if="hasTotp && activeMethod === 'email'"
          class="text-muted text-sm"
          @click.prevent="switchToTotp"
        >
          {{ $t("page.2fa.use_totp") }}
        </ULink>
        <DmsLink :to="backupTarget" class="text-muted text-sm">
          {{ $t("page.2fa.use_backup") }}
        </DmsLink>
        <DmsLink :to="backToLoginTarget" class="text-muted text-sm">
          {{ $t("button.back_to_login") }}
        </DmsLink>
      </div>
    </DmsCard>
  </div>
</template>
