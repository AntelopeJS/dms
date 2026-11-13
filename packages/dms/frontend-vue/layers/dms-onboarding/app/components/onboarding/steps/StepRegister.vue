<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import striptags from "striptags";
import StageCard from "#dms-layout/app/entries/components/layout/StageCard";
import AuthFormAlert from "#dms-auth/app/entries/components/AuthFormAlert";
import AuthNewPasswordField from "#dms-auth/app/entries/components/AuthNewPasswordField";
import {
  type AuthFormHandle,
  useAuthFormError,
} from "#dms-auth/app/entries/composables/useAuthFormError";
import type {
  OnboardingAdministrator,
  OnboardingPlatform,
} from "../../../build/composables/onboarding/steps";
import StepMeta from "../../../build/components/onboarding/StepMeta.vue";
import {
  focusFirstFormError,
  useLiveFormErrors,
  useLocalizedSchema,
} from "#dms-core/app/composables/useFormValidation";

interface RegisterStepProps {
  platform: OnboardingPlatform;
  /** The token the address carried; empty when the wizard has to ask for it. */
  setupToken: string;
}

interface RegisterStepEmits {
  back: [];
  registered: [administrator: OnboardingAdministrator];
}

const props = defineProps<RegisterStepProps>();
const emit = defineEmits<RegisterStepEmits>();

const { $authFetch } = useAuthFetch();
const dmsApp = useDmsApp();
const { formError, clearFormError, showError } = useAuthFormError();
const form = useTemplateRef<AuthFormHandle>("form");

const LOGIN_PATH = "/auth";
const MAX_NAME_PART_LENGTH = 100;

const isLoading = ref(false);
const isRegistered = ref(false);
const asksForSetupToken = !props.setupToken;

const namePart = z.string().trim().min(1).max(MAX_NAME_PART_LENGTH);

const fields = z
  .object({
    firstName: namePart,
    lastName: namePart,
    email: z.string().trim().email(),
    password: passwordSchema,
    setupToken: z.string().trim().min(1),
  })
  .transform((data) => ({
    firstName: striptags(data.firstName),
    lastName: striptags(data.lastName),
    email: striptags(data.email),
    password: data.password,
    setupToken: data.setupToken,
  }));

type Schema = z.output<typeof fields>;
const schema = useLocalizedSchema(fields);

const state = reactive<Partial<Schema>>({
  firstName: undefined,
  lastName: undefined,
  email: undefined,
  password: undefined,
  setupToken: props.setupToken,
});
useLiveFormErrors(form, state);

async function registerAdmin(data: Schema) {
  await $authFetch("/api/onboarding/register", {
    method: "POST",
    body: {
      ...data,
      platformName: props.platform.name,
      language: props.platform.language,
    },
  });
  isRegistered.value = true;
  dmsApp.runWithContext(() => setOnboardingComplete());
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (isLoading.value || isRegistered.value) return;

  try {
    isLoading.value = true;
    clearFormError();
    await registerAdmin(event.data);
    await $fetch("/auth/login", {
      method: "POST",
      body: { email: event.data.email, password: event.data.password },
    });
    emit("registered", {
      name: `${event.data.firstName} ${event.data.lastName}`,
      email: event.data.email,
    });
  } catch (error: unknown) {
    if (isRegistered.value) {
      window.location.replace(LOGIN_PATH);
      return;
    }

    await showError(error, "page.onboarding.administrator.error_title", {
      fields: ["firstName", "lastName", "email", "password", "setupToken"],
      form,
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <StageCard
    :title="$t('page.onboarding.administrator.title')"
    :description="$t('page.onboarding.administrator.description')"
  >
    <template #eyebrow>
      <StepMeta
        :step="2"
        :label="$t('page.onboarding.steps.administrator')"
        :aside="props.platform.name"
      />
    </template>

    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      novalidate
      @submit="onSubmit"
      @error="focusFirstFormError($event.errors)"
    >
      <AuthFormAlert :error="formError" />

      <UFormField
        v-if="asksForSetupToken"
        :label="$t('page.onboarding.administrator.setup_token')"
        :help="$t('page.onboarding.administrator.setup_token_help')"
        name="setupToken"
      >
        <UInput
          v-model="state.setupToken"
          autocomplete="off"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          :label="$t('page.onboarding.administrator.first_name')"
          name="firstName"
        >
          <UInput
            v-model="state.firstName"
            autocomplete="given-name"
            size="lg"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="$t('page.onboarding.administrator.last_name')"
          name="lastName"
        >
          <UInput
            v-model="state.lastName"
            autocomplete="family-name"
            size="lg"
            class="w-full"
          />
        </UFormField>
      </div>

      <UFormField
        :label="$t('page.onboarding.administrator.email')"
        name="email"
      >
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="email"
          icon="i-ph-envelope-simple"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <AuthNewPasswordField
        v-model="state.password"
        :label="$t('form.password.label')"
      />

      <UButton
        :label="$t('page.onboarding.administrator.submit')"
        :loading="isLoading"
        :disabled="isRegistered"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <button
      type="button"
      class="text-muted hover:text-highlighted mx-auto mt-3.5 flex items-center justify-center gap-1.5 text-[13px] transition-colors"
      :disabled="isLoading || isRegistered"
      @click="emit('back')"
    >
      <UIcon name="i-ph-arrow-left" class="size-3.5" />
      {{ $t("page.onboarding.administrator.back") }}
    </button>
  </StageCard>
</template>
