<script setup lang="ts">
import StepIndicator from "../components/onboarding/StepIndicator.vue";
import Platform from "../components/onboarding/steps/platform.vue";
import Ready from "../components/onboarding/steps/ready.vue";
import Register from "../components/onboarding/steps/register.vue";
import {
  ONBOARDING_STEPS,
  type OnboardingAdministrator,
  type OnboardingPlatform,
  type OnboardingStep,
} from "../composables/onboarding/steps";

// A custom page runs the global middleware only once it declares its meta:
// that is what lets the onboarding middleware send a visitor away from a
// wizard that is already finished, on a direct load as on a navigation.
defineDmsPageMeta({});

const { t, locale } = useI18n();
const { metaTitle } = useSystemState();

// The steps live in this one page, so the middleware, which releases a
// finished wizard, never runs between the account step and the Ready step.
const step = ref<OnboardingStep>("platform");
const platform = ref<OnboardingPlatform>({
  name: metaTitle.value,
  language: locale.value,
});

// The configured meta title only prefills the name, once it has loaded.
watch(metaTitle, (title) => {
  if (!platform.value.name) platform.value.name = title;
});
const administrator = ref<OnboardingAdministrator | null>(null);

const stepLabels = computed(() =>
  ONBOARDING_STEPS.map((id) => t(`page.onboarding.steps.${id}`)),
);
const currentIndex = computed(() => ONBOARDING_STEPS.indexOf(step.value));

function onRegistered(owner: OnboardingAdministrator) {
  administrator.value = owner;
  step.value = "ready";
}
</script>

<template>
  <div class="grid justify-items-center gap-[18px]">
    <StepIndicator
      :labels="stepLabels"
      :current="currentIndex"
      :steps-label="$t('page.onboarding.steps.aria_label')"
    />

    <Platform
      v-if="step === 'platform'"
      v-model="platform"
      @next="step = 'administrator'"
    />
    <Register
      v-else-if="step === 'administrator'"
      :platform="platform"
      @back="step = 'platform'"
      @registered="onRegistered"
    />
    <Ready
      v-else-if="administrator"
      :platform="platform"
      :administrator="administrator"
    />
  </div>
</template>
