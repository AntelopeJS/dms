<script setup lang="ts">
import { useTemplateRef } from "vue";
import * as z from "zod";
import type { SelectItem } from "@nuxt/ui";
import StageCard from "../../../../../dms-layout/app/components/layout/StageCard.vue";
import type { OnboardingPlatform } from "../../../composables/onboarding/steps";
import StepMeta from "../StepMeta.vue";
import {
  focusFirstFormError,
  type LiveFormHandle,
  useLiveFormErrors,
  useLocalizedSchema,
} from "#dms-core/app/composables/useFormValidation";

interface PlatformStepEmits {
  next: [];
}

const MAX_PLATFORM_NAME_LENGTH = 120;
const SECURE_PROTOCOL = "https:";

const platform = defineModel<OnboardingPlatform>({ required: true });
const emit = defineEmits<PlatformStepEmits>();

const { t } = useI18n();
const { uniqueLocales } = useUniqueLocales();

const languageItems = computed<SelectItem[]>(() =>
  uniqueLocales.value.map((lang) => ({ label: lang.name, value: lang.code })),
);

const schema = useLocalizedSchema(
  z.object({
    name: z.string().trim().min(1).max(MAX_PLATFORM_NAME_LENGTH),
    language: z.string().min(1),
  }),
);

const form = useTemplateRef<LiveFormHandle>("form");
useLiveFormErrors(form, platform.value);

// Read in the browser: the server render does not know the public address.
const host = ref("");
const isSecure = ref(false);

onMounted(() => {
  host.value = window.location.host;
  isSecure.value = window.location.protocol === SECURE_PROTOCOL;
});

const detectedLabel = computed(() =>
  t(
    isSecure.value
      ? "page.onboarding.platform.address_secure"
      : "page.onboarding.platform.address_insecure",
  ),
);
</script>

<template>
  <StageCard
    :title="$t('page.onboarding.platform.title')"
    :description="$t('page.onboarding.platform.description')"
  >
    <template #eyebrow>
      <StepMeta
        :step="1"
        :label="$t('page.onboarding.steps.platform')"
        :aside="$t('page.onboarding.platform.duration')"
      />
    </template>

    <UForm
      ref="form"
      :schema="schema"
      :state="platform"
      class="mt-[22px] grid gap-4"
      novalidate
      @submit="emit('next')"
      @error="focusFirstFormError($event.errors)"
    >
      <UFormField
        :label="$t('form.platform.label')"
        :help="$t('page.onboarding.platform.name_help')"
        name="name"
      >
        <UInput
          v-model="platform.name"
          autocomplete="organization"
          size="lg"
          class="w-full"
          autofocus
        />
      </UFormField>

      <UFormField
        :label="$t('page.onboarding.platform.language')"
        :help="$t('page.onboarding.platform.language_help')"
        name="language"
      >
        <USelect
          v-model="platform.language"
          :items="languageItems"
          icon="i-ph-globe"
          trailing-icon="i-ph-caret-up-down"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField :label="$t('page.onboarding.platform.address')">
        <UInput
          :model-value="host"
          size="lg"
          class="w-full"
          :ui="{ base: 'ps-[4.5rem]' }"
          disabled
        >
          <template #leading>
            <span class="text-dimmed font-mono text-xs">
              {{ isSecure ? "https://" : "http://" }}
            </span>
          </template>
        </UInput>
        <p
          v-if="host"
          class="text-muted mt-1.5 flex items-center gap-2 text-[12.5px]"
        >
          <UIcon
            :name="isSecure ? 'i-ph-check-circle' : 'i-ph-info'"
            class="size-3.5"
            :class="isSecure ? 'text-success' : 'text-warning'"
          />
          {{ detectedLabel }}
        </p>
      </UFormField>

      <UButton
        :label="$t('page.onboarding.platform.submit')"
        trailing-icon="i-ph-arrow-right"
        :ui="{ trailingIcon: 'ms-0' }"
        type="submit"
        size="lg"
        class="justify-center"
        block
      />
    </UForm>

    <p class="text-muted mt-5 text-center text-[13px]">
      {{ $t("page.onboarding.platform.team_hint") }}
    </p>
  </StageCard>
</template>
