<script setup lang="ts">
import StepIndicator from "../build/components/onboarding/StepIndicator.vue";
import Platform from "../build/components/onboarding/steps/StepPlatform.vue";
import Ready from "../build/components/onboarding/steps/StepReady.vue";
import Register from "../components/onboarding/steps/StepRegister.vue";
import {
  ONBOARDING_STEPS,
  type OnboardingAdministrator,
  type OnboardingPlatform,
  type OnboardingStep,
} from "../build/composables/onboarding/steps";

defineDmsPageMeta({});

const { t, locale } = useI18n();
const { metaTitle } = useSystemState();

const step = ref<OnboardingStep>("platform");
const platform = ref<OnboardingPlatform>({
  name: metaTitle.value,
  language: locale.value,
});

watch(metaTitle, (title) => {
  if (!platform.value.name) platform.value.name = title;
});
const administrator = ref<OnboardingAdministrator | null>(null);

const route = useDmsRoute();
const router = useDmsRouter();
const setupToken = ref("");

useHead({ meta: [{ name: "referrer", content: "no-referrer" }] });

onMounted(() => {
  const { token, ...query } = route.query;
  if (typeof token !== "string" || !token) return;
  setupToken.value = token;
  void router.replace({ query });
});

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
      :setup-token="setupToken"
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
