<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import StageCard from "../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthBackLink from "../../components/AuthBackLink.vue";
import AuthFormAlert from "../../components/AuthFormAlert.vue";
import { useAuthFormError } from "../../composables/useAuthFormError";
import { AUTH_LINK_CLASS } from "../../utils/authStyles";

const route = useDmsRoute();
const { formError, showFormError, clearFormError } = useAuthFormError();

const token = computed(() => (route.query.token as string) || "");

const twoFactorTarget = computed(() => ({
  path: "/auth/2fa",
  query: withAccountsFlag(route.query, {
    token: token.value,
    methods: route.query.methods,
  }),
}));

const backToLoginTarget = computed(() => ({
  path: "/auth",
  query: withAccountsFlag(route.query),
}));

const isLoading = ref(false);

// Codes are issued in uppercase and compared by hash: normalise what was typed.
const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .transform((code) => code.toUpperCase()),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({ code: undefined });

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true;
  clearFormError();
  try {
    await $fetch("/auth/verify-2fa", {
      method: "POST",
      body: {
        token: token.value,
        code: payload.data.code,
        method: "backup",
      },
    });

    await usePostLoginRedirect();
  } catch (error: unknown) {
    showFormError(error, "page.backup.error_title");
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard
    icon="i-ph-key"
    :title="$t('page.backup.title')"
    :description="$t('page.backup.description')"
  >
    <UForm
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

      <UFormField
        :label="$t('page.backup.code')"
        :help="$t('page.backup.code_help')"
        name="code"
      >
        <UInput
          v-model="state.code"
          :disabled="isLoading"
          autocomplete="one-time-code"
          spellcheck="false"
          placeholder="ABCD1234"
          size="lg"
          class="w-full"
          :ui="{ base: 'font-mono tracking-[0.08em] uppercase' }"
        />
      </UFormField>

      <UButton
        :loading="isLoading"
        :label="$t('page.2fa.verify')"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <p class="text-muted mt-5 text-center text-[13px]">
      <DmsLink :to="twoFactorTarget" :class="AUTH_LINK_CLASS">
        {{ $t("page.2fa.back_to_2fa") }}
      </DmsLink>
    </p>

    <AuthBackLink :to="backToLoginTarget" :label="$t('button.back_to_login')" />
  </StageCard>
</template>
