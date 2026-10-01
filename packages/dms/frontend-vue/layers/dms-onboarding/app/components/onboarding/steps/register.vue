<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import striptags from "striptags";
import StageCard from "../../../../../dms-layout/app/components/layout/StageCard.vue";
import AuthFormAlert from "../../../../../dms-auth/app/components/AuthFormAlert.vue";
import AuthNewPasswordField from "../../../../../dms-auth/app/components/AuthNewPasswordField.vue";
import { useAuthFormError } from "../../../../../dms-auth/app/composables/useAuthFormError";
import type {
  OnboardingAdministrator,
  OnboardingPlatform,
} from "../../../composables/onboarding/steps";
import StepMeta from "../StepMeta.vue";

interface RegisterStepProps {
  platform: OnboardingPlatform;
}

interface RegisterStepEmits {
  back: [];
  registered: [administrator: OnboardingAdministrator];
}

const props = defineProps<RegisterStepProps>();
const emit = defineEmits<RegisterStepEmits>();

const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const dmsApp = useDmsApp();
const { formError, showFormError, clearFormError } = useAuthFormError();

const LOGIN_PATH = "/auth";
const MAX_NAME_PART_LENGTH = 100;

const isLoading = ref(false);
const isRegistered = ref(false);
const isPasswordValid = ref(false);

const namePart = z
  .string()
  .trim()
  .min(1, { message: t("page.onboarding.administrator.name_required") })
  .max(MAX_NAME_PART_LENGTH);

const schema = z
  .object({
    firstName: namePart,
    lastName: namePart,
    email: z.string().trim().email(),
    password: passwordSchema,
  })
  .transform((data) => ({
    firstName: striptags(data.firstName),
    lastName: striptags(data.lastName),
    email: striptags(data.email),
    password: data.password,
  }));

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  firstName: undefined,
  lastName: undefined,
  email: undefined,
  password: undefined,
});

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
      // A full reload also clears fatal layout errors from the failed login.
      window.location.replace(LOGIN_PATH);
      return;
    }
    showFormError(error, "page.onboarding.administrator.error_title");
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
      :schema="schema"
      :state="state"
      class="mt-[22px] grid gap-4"
      @submit="onSubmit"
    >
      <AuthFormAlert :error="formError" />

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
        v-model:valid="isPasswordValid"
        :label="$t('form.password.label')"
      />

      <UButton
        :label="$t('page.onboarding.administrator.submit')"
        :loading="isLoading"
        :disabled="!isPasswordValid || isRegistered"
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
